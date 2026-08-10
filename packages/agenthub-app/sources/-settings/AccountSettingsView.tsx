import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, View, Text, Pressable } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Typography } from '@/constants/Typography';
import { formatSecretKeyForBackup } from '@/auth/secretKeyBackup';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { Modal } from '@/modal';
import { t } from '@/text';
import { layout } from '@/components/layout';
import { useProfile } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { getDisplayName } from '@/sync/profile';
import { SettingsPage } from '@/components/SettingsPage';
import { canUseDeviceProtectedSecret, shouldClearProtectedClipboard } from '@/auth/secretProtection';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { fetchPushTokens, type PushToken } from '@/sync/apiPush';
import {
    getCurrentExpoPushToken,
    getCurrentPushDeviceMetadata,
    getPushPermissionInfo,
    requestPushPermissionOrOpenSettings,
    removePushToken,
    syncCurrentPushToken,
    type PushPermissionInfo,
} from '@/sync/pushRegistration';
import { runPushSettingsLoad } from './pushSettingsLoadLifecycle';

function formatPushPermissionLabel(permission: PushPermissionInfo | null): string {
    if (!permission) {
        return t('settingsAccount.pushPermLoading');
    }
    if (permission.status === 'unsupported') {
        return t('settingsAccount.pushPermUnavailable');
    }
    if (permission.granted) {
        return t('settingsAccount.pushPermAllowed');
    }
    if (permission.status === 'denied') {
        return t('settingsAccount.pushPermDenied');
    }
    return t('settingsAccount.pushPermNotRequested');
}

function formatPushPermissionSubtitle(permission: PushPermissionInfo | null): string {
    if (!permission) {
        return t('settingsAccount.pushPermSubChecking');
    }
    if (permission.status === 'unsupported') {
        return t('settingsAccount.pushPermSubUnsupported');
    }
    if (permission.granted) {
        return t('settingsAccount.pushPermSubGranted');
    }
    if (permission.canAskAgain) {
        return t('settingsAccount.pushPermSubCanAskAgain');
    }
    return t('settingsAccount.pushPermSubIOSDenied');
}

function formatPushTokenFingerprint(token: string): string {
    const rawValue = token.replace(/^ExponentPushToken\[/, '').replace(/\]$/, '');
    if (rawValue.length <= 12) {
        return rawValue;
    }
    return `${rawValue.slice(0, 6)}…${rawValue.slice(-6)}`;
}

function formatPushTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
}

function buildPushTokenSubtitle(pushToken: PushToken, options: {
    isCurrentDevice: boolean;
    currentDeviceLabel: string;
    currentAppLabel: string | null;
}): string {
    const lines: string[] = [];

    if (options.isCurrentDevice) {
        lines.push(options.currentDeviceLabel);
        if (options.currentAppLabel) {
            lines.push(options.currentAppLabel);
        }
    } else {
        lines.push(t('settingsAccount.pushOtherDevice'));
    }

    lines.push(t('settingsAccount.pushRegistered', { time: formatPushTimestamp(pushToken.createdAt) }));
    lines.push(t('settingsAccount.pushLastSeen', { time: formatPushTimestamp(pushToken.updatedAt) }));
    lines.push(t('settingsAccount.pushServerId', { id: pushToken.id }));
    lines.push(t('settingsAccount.pushTokenLabel', { token: formatPushTokenFingerprint(pushToken.token) }));
    return lines.join('\n');
}

const SECRET_SCREEN_CAPTURE_KEY = 'agenthub-account-secret';
const SECRET_CLIPBOARD_TTL_MS = 30_000;

function SecretScreenCaptureProtection() {
    ScreenCapture.usePreventScreenCapture(SECRET_SCREEN_CAPTURE_KEY);
    return null;
}

export const AccountSettingsView = React.memo(() => {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const [showSecret, setShowSecret] = useState(false);
    const [copiedRecently, setCopiedRecently] = useState(false);
    const isFocused = useIsFocused();
    const clipboardTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const profile = useProfile();
    const currentPushDevice = useMemo(() => getCurrentPushDeviceMetadata(), []);
    const [pushTokens, setPushTokens] = useState<PushToken[]>([]);
    const [pushPermission, setPushPermission] = useState<PushPermissionInfo | null>(null);
    const [currentPushToken, setCurrentPushToken] = useState<string | null>(null);
    const [loadingPushSettings, setLoadingPushSettings] = useState(false);
    const [requestingPushPermission, setRequestingPushPermission] = useState(false);
    const [refreshingPushToken, setRefreshingPushToken] = useState(false);
    const [deletingPushToken, setDeletingPushToken] = useState<string | null>(null);

    // Get the current secret key
    const currentSecret = auth.credentials?.secret || '';
    const formattedSecret = currentSecret ? formatSecretKeyForBackup(currentSecret) : '';

    // Profile display values
    const displayName = getDisplayName(profile);

    const loadPushSettings = useCallback(async (showError = false) => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!credentials || generation === null) {
            setPushTokens([]);
            setPushPermission(null);
            setCurrentPushToken(null);
            setLoadingPushSettings(false);
            return;
        }

        const isCurrent = () => sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;
        await runPushSettingsLoad({
            fetchTokens: () => fetchPushTokens(credentials),
            getPermission: getPushPermissionInfo,
            getCurrentToken: getCurrentExpoPushToken,
            isCurrent,
            apply: ({ tokens, permission, currentToken }) => {
                setPushTokens(tokens);
                setPushPermission(permission);
                setCurrentPushToken(currentToken);
            },
            setLoading: setLoadingPushSettings,
            onError: (error) => {
                console.error('Failed to load push notification settings:', error);
                if (showError && isCurrent()) {
                    Modal.alert(t('common.error'), t('settingsAccount.pushErrorLoadSettings'));
                }
            },
        });
    }, [auth.credentials]);

    useEffect(() => {
        void loadPushSettings();
    }, [loadPushSettings]);

    useEffect(() => {
        setRequestingPushPermission(false);
        setRefreshingPushToken(false);
        setDeletingPushToken(null);
    }, [auth.credentials?.token]);

    useFocusEffect(
        useCallback(() => {
            void loadPushSettings();
        }, [loadPushSettings])
    );

    const clearProtectedClipboard = useCallback(async () => {
        if (!formattedSecret) {
            return;
        }
        try {
            const currentValue = await Clipboard.getStringAsync();
            if (shouldClearProtectedClipboard(currentValue, formattedSecret)) {
                await Clipboard.setStringAsync('');
            }
        } catch (error) {
            console.warn('Failed to clear protected clipboard value:', error);
        }
    }, [formattedSecret]);

    const authenticateForSecret = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
            Modal.alert(t('common.error'), t('settingsAccount.secretKeyMobileOnly'));
            return false;
        }

        try {
            const [hasHardware, isEnrolled] = await Promise.all([
                LocalAuthentication.hasHardwareAsync(),
                LocalAuthentication.isEnrolledAsync(),
            ]);
            if (!canUseDeviceProtectedSecret({ platform: Platform.OS, hasHardware, isEnrolled })) {
                Modal.alert(t('common.error'), t('settingsAccount.secretKeyDeviceAuthRequired'));
                return false;
            }
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: t('settingsAccount.secretKeyAuthenticate'),
                cancelLabel: t('common.cancel'),
                disableDeviceFallback: false,
                biometricsSecurityLevel: 'strong',
            });
            if (!result.success && result.error !== 'user_cancel' && result.error !== 'system_cancel' && result.error !== 'app_cancel') {
                Modal.alert(t('common.error'), t('settingsAccount.secretKeyAuthFailed'));
            }
            return result.success;
        } catch (error) {
            console.error('Failed to authenticate protected secret action:', error);
            Modal.alert(t('common.error'), t('settingsAccount.secretKeyAuthFailed'));
            return false;
        }
    }, []);

    useEffect(() => {
        if (!isFocused) {
            setShowSecret(false);
            setCopiedRecently(false);
        }
    }, [isFocused]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState !== 'active') {
                setShowSecret(false);
                setCopiedRecently(false);
                void clearProtectedClipboard();
            }
        });
        return () => subscription.remove();
    }, [clearProtectedClipboard]);

    useFocusEffect(useCallback(() => {
        if (Platform.OS === 'ios') {
            void ScreenCapture.enableAppSwitcherProtectionAsync(1);
        }
        return () => {
            setShowSecret(false);
            if (Platform.OS === 'ios') {
                void ScreenCapture.disableAppSwitcherProtectionAsync();
            }
        };
    }, []));

    useEffect(() => () => {
        if (clipboardTimeout.current) {
            clearTimeout(clipboardTimeout.current);
        }
        void clearProtectedClipboard();
    }, [clearProtectedClipboard]);

    const handleShowSecret = async () => {
        if (showSecret) {
            setShowSecret(false);
            return;
        }
        if (await authenticateForSecret()) {
            setShowSecret(true);
        }
    };

    const handleCopySecret = async () => {
        try {
            if (!await authenticateForSecret()) {
                return;
            }
            await Clipboard.setStringAsync(formattedSecret);
            setCopiedRecently(true);
            if (clipboardTimeout.current) {
                clearTimeout(clipboardTimeout.current);
            }
            clipboardTimeout.current = setTimeout(() => {
                setCopiedRecently(false);
                void clearProtectedClipboard();
            }, SECRET_CLIPBOARD_TTL_MS);
            Modal.alert(t('common.success'), t('settingsAccount.secretKeyCopiedTemporarily'));
        } catch (error) {
            Modal.alert(t('common.error'), t('settingsAccount.secretKeyCopyFailed'));
        }
    };

    const handleLogout = async () => {
        const confirmed = await Modal.confirm(
            t('common.logout'),
            t('settingsAccount.logoutConfirm'),
            { confirmText: t('common.logout'), destructive: true }
        );
        if (confirmed) {
            auth.logout();
        }
    };

    const handlePushPermissionRequest = useCallback(async () => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!credentials || generation === null) {
            return;
        }
        const isCurrent = () => sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;

        setRequestingPushPermission(true);
        try {
            const result = await requestPushPermissionOrOpenSettings();
            if (!isCurrent()) return;
            setPushPermission(result.permission);

            if (result.granted) {
                await syncCurrentPushToken(credentials);
                if (!isCurrent()) return;
                await loadPushSettings();
                if (!isCurrent()) return;
                Modal.alert(t('common.success'), t('settingsAccount.pushSuccessEnabled'));
                return;
            }

            await loadPushSettings();
            if (!isCurrent()) return;

            if (result.openedSettings) {
                Modal.alert(t('settingsAccount.pushOpenSettings'), t('settingsAccount.pushOpenedSettingsMsg'));
                return;
            }

            Modal.alert(t('common.error'), t('settingsAccount.pushPermNotGranted'));
        } catch (error) {
            if (isCurrent()) {
                console.error('Failed to request push permission:', error);
                Modal.alert(t('common.error'), t('settingsAccount.pushErrorRequestPerm'));
            }
        } finally {
            if (isCurrent()) {
                setRequestingPushPermission(false);
            }
        }
    }, [auth.credentials, loadPushSettings]);

    const handleRefreshCurrentPushToken = useCallback(async () => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!credentials || generation === null) {
            return;
        }
        const isCurrent = () => sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;

        setRefreshingPushToken(true);
        try {
            const result = await syncCurrentPushToken(credentials);
            if (!isCurrent()) return;
            setPushPermission(result.permission);
            await loadPushSettings();
            if (!isCurrent()) return;

            if (!result.permission.granted) {
                Modal.alert(t('common.error'), t('settingsAccount.pushNotEnabledYet'));
                return;
            }

            Modal.alert(t('common.success'), t('settingsAccount.pushTokenRefreshed'));
        } catch (error) {
            if (isCurrent()) {
                console.error('Failed to refresh push token:', error);
                Modal.alert(t('common.error'), t('settingsAccount.pushErrorRefresh'));
            }
        } finally {
            if (isCurrent()) {
                setRefreshingPushToken(false);
            }
        }
    }, [auth.credentials, loadPushSettings]);

    const handleDeletePushToken = useCallback(async (pushToken: PushToken) => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!credentials || generation === null) {
            return;
        }
        const isCurrent = () => sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;

        const confirmed = await Modal.confirm(
            t('settingsAccount.pushDeleteToken'),
            t('settingsAccount.pushDeleteTokenConfirm', { token: formatPushTokenFingerprint(pushToken.token) }),
            { confirmText: t('common.delete'), destructive: true }
        );

        if (!confirmed) {
            return;
        }
        if (!isCurrent()) return;

        setDeletingPushToken(pushToken.token);
        try {
            await removePushToken(credentials, pushToken.token);
            if (!isCurrent()) return;
            await loadPushSettings();
            if (!isCurrent()) return;
        } catch (error) {
            if (isCurrent()) {
                console.error('Failed to delete push token:', error);
                Modal.alert(t('common.error'), t('settingsAccount.pushErrorDelete'));
            }
        } finally {
            if (isCurrent()) {
                setDeletingPushToken(null);
            }
        }
    }, [auth.credentials, loadPushSettings]);

    return (
        <SettingsPage title={t('settings.account')}>
                {/* Account Info */}
                <ItemGroup title={t('settingsAccount.accountInformation')}>
                    <Item
                        title={t('settingsAccount.status')}
                        detail={auth.isAuthenticated ? t('settingsAccount.statusActive') : t('settingsAccount.statusNotAuthenticated')}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.anonymousId')}
                        subtitle={sync.anonID || t('settingsAccount.notAvailable')}
                        subtitleLines={0}
                        subtitleStyle={Typography.mono()}
                        showChevron={false}
                        copy={!!sync.anonID}
                    />
                    <Item
                        title={t('settingsAccount.publicId')}
                        subtitle={sync.serverID || t('settingsAccount.notAvailable')}
                        subtitleLines={0}
                        subtitleStyle={Typography.mono()}
                        showChevron={false}
                        copy={!!sync.serverID}
                    />
                </ItemGroup>

                {/* Profile Section */}
                {(displayName || profile.avatar) && (
                    <ItemGroup title={t('settingsAccount.profile')}>
                        {displayName && (
                            <Item
                                title={t('settingsAccount.name')}
                                detail={displayName}
                                showChevron={false}
                            />
                        )}
                    </ItemGroup>
                )}

                {/* Backup Section */}
                <ItemGroup
                    title={t('settingsAccount.backup')}
                    footer={t('settingsAccount.backupDescription')}
                >
                    <Item
                        title={t('settingsAccount.secretKey')}
                        subtitle={Platform.OS === 'web'
                            ? t('settingsAccount.secretKeyMobileOnly')
                            : showSecret
                                ? t('settingsAccount.tapToHide')
                                : t('settingsAccount.tapToReveal')}
                        subtitleLines={0}
                        icon={<Ionicons name={Platform.OS === 'web' ? "lock-closed-outline" : showSecret ? "eye-off-outline" : "eye-outline"} size={29} color="#FF9500" />}
                        onPress={handleShowSecret}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Secret Key Display */}
                {showSecret && (
                    <ItemGroup>
                        <SecretScreenCaptureProtection />
                        <Pressable
                            onPress={handleCopySecret}
                            accessibilityRole="button"
                            accessibilityLabel={t('settingsAccount.secretKeyLabel')}
                        >
                            <View style={{
                                backgroundColor: theme.colors.surface,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                width: '100%',
                                maxWidth: layout.maxWidth,
                                alignSelf: 'center'
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <Text style={{
                                        fontSize: 11,
                                        color: theme.colors.textSecondary,
                                        letterSpacing: 0.5,
                                        textTransform: 'uppercase',
                                        ...Typography.default('semiBold')
                                    }}>
                                        {t('settingsAccount.secretKeyLabel')}
                                    </Text>
                                    <Ionicons
                                        name={copiedRecently ? "checkmark-circle" : "copy-outline"}
                                        size={18}
                                        color={copiedRecently ? "#34C759" : theme.colors.textSecondary}
                                    />
                                </View>
                                <Text style={{
                                    fontSize: 13,
                                    letterSpacing: 0.5,
                                    lineHeight: 20,
                                    color: theme.colors.text,
                                    ...Typography.mono()
                                }}>
                                    {formattedSecret}
                                </Text>
                            </View>
                        </Pressable>
                    </ItemGroup>
                )}

                <ItemGroup
                    title={t('settingsAccount.pushNotifications')}
                    footer={t('settingsAccount.pushNotificationsFooter')}
                >
                    <Item
                        title={t('settingsAccount.pushPermission')}
                        titleLines={0}
                        subtitle={[
                            formatPushPermissionLabel(pushPermission),
                            formatPushPermissionSubtitle(pushPermission),
                        ].join('\n')}
                        subtitleLines={0}
                        icon={<Ionicons name="notifications-outline" size={29} color={theme.colors.accent} />}
                        loading={loadingPushSettings}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.pushRequestPermission')}
                        titleLines={0}
                        subtitle={pushPermission?.status === 'unsupported'
                            ? t('settingsAccount.pushRequestPermSubtitleUnsupported')
                            : pushPermission?.canAskAgain
                            ? t('settingsAccount.pushRequestPermSubtitleCanAsk')
                            : t('settingsAccount.pushRequestPermSubtitleCannotAsk')}
                        subtitleLines={0}
                        icon={<Ionicons name="shield-checkmark-outline" size={29} color="#34C759" />}
                        onPress={handlePushPermissionRequest}
                        loading={requestingPushPermission}
                        disabled={requestingPushPermission || loadingPushSettings || pushPermission?.status === 'unsupported' || !auth.credentials}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.pushReregisterDevice')}
                        titleLines={0}
                        subtitle={currentPushToken
                            ? t('settingsAccount.pushCurrentToken', { token: formatPushTokenFingerprint(currentPushToken) })
                            : t('settingsAccount.pushReregisterSubtitle')}
                        subtitleLines={0}
                        icon={<Ionicons name="refresh-outline" size={29} color="#FF9500" />}
                        onPress={handleRefreshCurrentPushToken}
                        loading={refreshingPushToken}
                        disabled={refreshingPushToken || loadingPushSettings || !auth.credentials}
                        showChevron={false}
                    />
                </ItemGroup>

                <ItemGroup
                    title={t('settingsAccount.pushTokensTitle', { count: pushTokens.length })}
                    footer={t('settingsAccount.pushTokensFooter')}
                >
                    {pushTokens.length === 0 ? (
                        <Item
                            title={t('settingsAccount.pushNoTokens')}
                            titleLines={0}
                            subtitle={t('settingsAccount.pushNoTokensSubtitle')}
                            subtitleLines={0}
                            showChevron={false}
                        />
                    ) : (
                        <>
                            {pushTokens.map((pushToken) => {
                                const isCurrentDevice = currentPushToken === pushToken.token;
                                return (
                                    <Item
                                        key={pushToken.id}
                                        title={formatPushTokenFingerprint(pushToken.token)}
                                        detail={isCurrentDevice ? t('settingsAccount.pushThisDevice') : undefined}
                                        subtitle={buildPushTokenSubtitle(pushToken, {
                                            isCurrentDevice,
                                            currentDeviceLabel: currentPushDevice.deviceLabel,
                                            currentAppLabel: currentPushDevice.appLabel,
                                        })}
                                        subtitleLines={0}
                                        icon={(
                                            <Ionicons
                                                name={isCurrentDevice ? 'phone-portrait-outline' : 'trash-outline'}
                                                size={29}
                                                color={isCurrentDevice ? theme.colors.textSecondary : '#FF3B30'}
                                            />
                                        )}
                                        onPress={isCurrentDevice ? undefined : () => handleDeletePushToken(pushToken)}
                                        loading={deletingPushToken === pushToken.token}
                                        disabled={deletingPushToken !== null}
                                        showChevron={false}
                                        copy={isCurrentDevice ? pushToken.token : false}
                                    />
                                );
                            })}
                        </>
                    )}
                </ItemGroup>

                {/* Danger Zone */}
                <ItemGroup title={t('settingsAccount.dangerZone')}>
                    <Item
                        title={t('settingsAccount.logout')}
                        titleLines={0}
                        subtitle={t('settingsAccount.logoutSubtitle')}
                        subtitleLines={0}
                        icon={<Ionicons name="log-out-outline" size={29} color="#FF3B30" />}
                        destructive
                        onPress={handleLogout}
                    />
                </ItemGroup>
        </SettingsPage>
    );
});
