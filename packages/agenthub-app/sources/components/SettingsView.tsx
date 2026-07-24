import { View, Text, Platform, Linking } from 'react-native';
import { Image } from 'expo-image';
import * as React from 'react';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useLocalSettingMutable, useSetting } from '@/sync/storage';
import { trackWhatsNewClicked } from '@/track';
import { Modal } from '@/modal';
import { useMultiClick } from '@/hooks/useMultiClick';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { useItemScale } from '@/components/ItemScaleContext';
import { useUpdates } from '@/hooks/useUpdates';

const SettingsHeader = React.memo(function SettingsHeader() {
    const { theme } = useUnistyles();
    const s = useItemScale();

    return (
        <View style={{ maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }}>
            <View style={{
                marginTop: s(14),
                marginHorizontal: s(16),
                padding: s(4),
                borderRadius: s(18),
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                backgroundColor: theme.dark ? 'rgba(255, 178, 46, 0.08)' : theme.colors.surfaceRaised,
                shadowColor: theme.dark ? '#000000' : theme.colors.glass.shadow,
                shadowOpacity: theme.dark ? 0.28 : 0.10,
                shadowRadius: s(14),
                shadowOffset: { width: 0, height: s(8) },
                elevation: 2,
            }}>
                <View style={{
                    borderRadius: s(14),
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: theme.dark ? 'rgba(255, 178, 46, 0.22)' : theme.colors.border,
                    backgroundColor: theme.colors.canvas,
                }}>
                    <Image
                        source={theme.dark ? require('@/assets/images/agenthub-settings-banner-dark.png') : require('@/assets/images/agenthub-settings-banner-light.png')}
                        contentFit="cover"
                        alt=""
                        accessibilityLabel=""
                        accessible={false}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={{
                            width: '100%',
                            aspectRatio: 1774 / 443,
                            minHeight: s(72),
                            maxHeight: s(168),
                        }}
                    />
                </View>
            </View>
        </View>
    );
});

export const SettingsView = React.memo(function SettingsView() {
    const { theme } = useUnistyles();
    const settingsIconColor = theme.dark ? theme.colors.accent : theme.colors.textSecondary;
    const router = useRouter();
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const [devModeEnabled, setDevModeEnabled] = useLocalSettingMutable('devModeEnabled');
    const experiments = useSetting('experiments');
    const { updateAvailable, isChecking, isDownloading, updateStatus, checkForUpdates, reloadApp } = useUpdates();

    // Use the multi-click hook for version clicks
    const handleVersionClick = useMultiClick(() => {
        // Toggle dev mode
        const newDevMode = !devModeEnabled;
        setDevModeEnabled(newDevMode);
        Modal.alert(
            t('modals.developerMode'),
            newDevMode ? t('modals.developerModeEnabled') : t('modals.developerModeDisabled')
        );
    }, {
        requiredClicks: 10,
        resetTimeout: 2000
    });

    const handleCheckForUpdates = React.useCallback(async () => {
        if (updateAvailable) {
            await reloadApp();
            return;
        }

        const result = await checkForUpdates({ silent: false });
        if (result === 'none') {
            Modal.alert(t('settings.noUpdatesAvailable'));
        } else if (result === 'unavailable') {
            Modal.alert(t('settings.updateCheckUnavailable'));
        } else if (result === 'error') {
            Modal.alert(t('common.error'), t('settings.updateCheckFailed'));
        }
    }, [checkForUpdates, reloadApp, updateAvailable]);

    const updateCheckSubtitle = React.useMemo(() => {
        if (updateAvailable) return t('updateBanner.restartToApply');
        if (isDownloading || updateStatus === 'downloading') return t('updateBanner.downloadingUpdateSubtitle');
        if (isChecking || updateStatus === 'checking') return t('updateBanner.checkingForUpdateSubtitle');
        return t('settings.checkForUpdatesSubtitle');
    }, [isChecking, isDownloading, updateAvailable, updateStatus]);

    return (

        <View role="main" style={{ flex: 1 }}>
            <Text
                role="heading"
                aria-level={1}
                style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
            >
                {t('settings.title')}
            </Text>
            <ItemList style={{ paddingTop: 0 }}>
            {/* App Info Header */}
            <SettingsHeader />

            <ItemGroup title={t('settings.account')}>
                <Item
                    title={t('settings.account')}
                    titleLines={0}
                    subtitle={t('settings.accountSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="person-circle-outline" size={29} color={settingsIconColor} />}
                    onPress={() => router.push('/settings/account')}
                />
                <Item
                    title={t('settings.apiCredentials')}
                    titleLines={0}
                    subtitle={t('settings.apiCredentialsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="key-outline" size={29} color={settingsIconColor} />}
                    onPress={() => router.push('/settings/credentials')}
                />
                <Item
                    title={t('externalShares.title')}
                    titleLines={0}
                    subtitle={t('externalShares.settingsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="link-outline" size={29} color={settingsIconColor} />}
                    onPress={() => router.push('/settings/shared-links' as any)}
                />
            </ItemGroup>

            {/* Features */}
            <ItemGroup title={t('settings.features')}>
                <Item
                    title={t('settings.appearance')}
                    titleLines={0}
                    subtitle={t('settings.appearanceSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="color-palette-outline" size={29} color={settingsIconColor} />}
                    onPress={() => router.push('/settings/appearance')}
                />
                <Item
                    title={t('settings.featuresTitle')}
                    titleLines={0}
                    subtitle={t('settings.featuresSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="flask-outline" size={29} color={settingsIconColor} />}
                    onPress={() => router.push('/settings/features')}
                />
                {experiments && (
                    <Item
                        title={t('settings.usage')}
                        titleLines={0}
                        subtitle={t('settings.usageSubtitle')}
                        subtitleLines={0}
                        icon={<Ionicons name="analytics-outline" size={29} color={settingsIconColor} />}
                        onPress={() => router.push('/settings/usage')}
                    />
                )}
            </ItemGroup>

            {/* Developer */}
            {(__DEV__ || devModeEnabled) && (
                <ItemGroup title={t('settings.developer')}>
                    <Item
                        title={t('settings.developerTools')}
                        icon={<Ionicons name="construct-outline" size={29} color={settingsIconColor} />}
                        onPress={() => router.push('/dev')}
                    />
                </ItemGroup>
            )}

            {/* About */}
            <ItemGroup title={t('settings.about')} footer={t('settings.aboutFooter')}>
                <Item
                    title={t('settings.whatsNew')}
                    titleLines={0}
                    subtitle={t('settings.whatsNewSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="sparkles-outline" size={29} color={settingsIconColor} />}
                    onPress={() => {
                        trackWhatsNewClicked();
                        router.push('/changelog');
                    }}
                />
                <Item
                    title={t('settings.checkForUpdates')}
                    titleLines={0}
                    subtitle={updateCheckSubtitle}
                    subtitleLines={0}
                    icon={<Ionicons name={updateAvailable ? 'cloud-done-outline' : 'cloud-download-outline'} size={29} color={settingsIconColor} />}
                    loading={isChecking || isDownloading || updateStatus === 'restarting'}
                    showChevron={false}
                    onPress={handleCheckForUpdates}
                />
                {Platform.OS === 'ios' && (
                    <Item
                        title={t('settings.eula')}
                        icon={<Ionicons name="document-text-outline" size={29} color={settingsIconColor} />}
                        onPress={async () => {
                            const url = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
                            const supported = await Linking.canOpenURL(url);
                            if (supported) {
                                await Linking.openURL(url);
                            }
                        }}
                    />
                )}
                <Item
                    title={t('common.version')}
                    detail={appVersion}
                    icon={<Ionicons name="information-circle-outline" size={29} color={settingsIconColor} />}
                    onPress={handleVersionClick}
                    showChevron={false}
                />
            </ItemGroup>

            </ItemList>
        </View>
    );
});
