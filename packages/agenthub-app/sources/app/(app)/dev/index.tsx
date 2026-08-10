import * as React from 'react';
import { ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useLocalSettingMutable, useSocketStatus } from '@/sync/storage';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { getServerUrl, setServerUrl, validateServerUrl, getLogServerUrl, setLogServerUrl } from '@/sync/serverConfig';
import { Switch } from '@/components/Switch';
import { useUnistyles } from 'react-native-unistyles';
import { setLastViewedVersion, getLatestVersion } from '@/changelog';
import { t } from '@/text';

export default function DevScreen() {
    const router = useRouter();
    const [debugMode, setDebugMode] = useLocalSettingMutable('debugMode');
    const [verboseLogging, setVerboseLogging] = useLocalSettingMutable('verboseLogging');
    const [consoleLoggingEnabled, setConsoleLoggingEnabled] = useLocalSettingMutable('consoleLoggingEnabled');
    const socketStatus = useSocketStatus();
    const anonymousId = sync.encryption!.anonID;
    const { theme } = useUnistyles();

    const handleEditServerUrl = async () => {
        const currentUrl = getServerUrl();

        const newUrl = await Modal.prompt(
            t('devTools.editApiEndpoint'),
            t('devTools.enterServerUrl'),
            {
                defaultValue: currentUrl,
                confirmText: t('common.save')
            }
        );

        if (newUrl && newUrl !== currentUrl) {
            const validation = validateServerUrl(newUrl);
            if (validation.valid) {
                setServerUrl(newUrl);
                Modal.alert(t('common.success'), t('devTools.serverUrlUpdated'));
            } else {
                Modal.alert(t('devTools.invalidUrl'), validation.error || t('devTools.enterValidUrl'));
            }
        }
    };

    const handleEditLogServerUrl = async () => {
        const currentUrl = getLogServerUrl() || '';

        const newUrl = await Modal.prompt(
            t('devTools.remoteLogServer'),
            t('devTools.remoteLogDescription'),
            {
                defaultValue: currentUrl,
                confirmText: t('common.save')
            }
        );

        if (newUrl !== undefined && newUrl !== currentUrl) {
            if (!newUrl || !newUrl.trim()) {
                setLogServerUrl(null);
                Modal.alert(t('common.success'), t('devTools.remoteLoggingDisabled'));
            } else {
                const validation = validateServerUrl(newUrl);
                if (validation.valid) {
                    setLogServerUrl(newUrl);
                    Modal.alert(t('common.success'), t('devTools.logServerUpdated'));
                } else {
                    Modal.alert(t('devTools.invalidUrl'), validation.error || t('devTools.enterValidUrl'));
                }
            }
        }
    };

    const handleClearCache = async () => {
        const confirmed = await Modal.confirm(
            t('devTools.clearCacheTitle'),
            t('devTools.clearCacheConfirm'),
            { confirmText: t('common.reset'), destructive: true }
        );
        if (confirmed) {
            console.log('Cache cleared');
            Modal.alert(t('common.success'), t('devTools.clearCacheDone'));
        }
    };

    // Helper function to format time ago
    const formatTimeAgo = (timestamp: number | null): string => {
        if (!timestamp) return '';

        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 10) return t('devTools.justNow');
        if (seconds < 60) return t('devTools.timeAgo', { value: seconds, unit: 's' });
        if (minutes < 60) return t('devTools.timeAgo', { value: minutes, unit: 'm' });
        if (hours < 24) return t('devTools.timeAgo', { value: hours, unit: 'h' });
        if (days < 7) return t('devTools.timeAgo', { value: days, unit: 'd' });

        return new Date(timestamp).toLocaleDateString();
    };

    // Helper function to get socket status subtitle
    const getSocketStatusSubtitle = (): string => {
        const { status, lastConnectedAt, lastDisconnectedAt } = socketStatus;

        if (status === 'connected' && lastConnectedAt) {
            return t('devTools.connected', { time: formatTimeAgo(lastConnectedAt) });
        } else if ((status === 'disconnected' || status === 'error') && lastDisconnectedAt) {
            return t('devTools.lastConnected', { time: formatTimeAgo(lastDisconnectedAt) });
        } else if (status === 'connecting') {
            return t('devTools.connectingToServer');
        }

        return t('devTools.noConnectionInfo');
    };

    // Socket status indicator component
    const SocketStatusIndicator = () => {
        switch (socketStatus.status) {
            case 'connected':
                return <Ionicons name="checkmark-circle" size={22} color="#34C759" />;
            case 'connecting':
                return <ActivityIndicator size="small" color={theme.colors.textSecondary} />;
            case 'error':
                return <Ionicons name="close-circle" size={22} color="#FF3B30" />;
            case 'disconnected':
                return <Ionicons name="close-circle" size={22} color="#FF9500" />;
            default:
                return <Ionicons name="help-circle" size={22} color="#8E8E93" />;
        }
    };

    return (
        <ItemList>
            {/* App Information */}
            <ItemGroup title={t('devTools.appInfo')}>
                <Item
                    title={t('devTools.version')}
                    detail={Constants.expoConfig?.version || '1.0.0'}
                />
                <Item
                    title={t('devTools.buildNumber')}
                    detail={Application.nativeBuildVersion || 'N/A'}
                />
                <Item
                    title={t('devTools.sdkVersion')}
                    detail={Constants.expoConfig?.sdkVersion || t('status.unknown')}
                />
                <Item
                    title={t('devTools.platform')}
                    detail={`${Constants.platform?.ios ? 'iOS' : 'Android'} ${Constants.systemVersion || ''}`}
                />
                <Item
                    title={t('devTools.anonymousId')}
                    detail={anonymousId}
                />
            </ItemGroup>

            {/* Debug Options */}
            <ItemGroup title={t('devTools.debugOptions')}>
                <Item
                    title={t('devTools.debugMode')}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('devTools.debugMode')}
                            value={debugMode}
                            onValueChange={setDebugMode}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title={t('devTools.consoleOutput')}
                    titleLines={0}
                    subtitle={t('devTools.consoleOutputSubtitle')}
                    subtitleLines={0}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('devTools.consoleOutput')}
                            value={consoleLoggingEnabled}
                            onValueChange={setConsoleLoggingEnabled}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title={t('devTools.verboseLogging')}
                    titleLines={0}
                    subtitle={t('devTools.verboseLoggingSubtitle')}
                    subtitleLines={0}
                    rightElement={
                        <Switch
                            accessibilityLabel={t('devTools.verboseLogging')}
                            value={verboseLogging}
                            onValueChange={setVerboseLogging}
                        />
                    }
                    showChevron={false}
                />
                <Item
                    title={t('devTools.viewLogs')}
                    icon={<Ionicons name="document-text-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/logs')}
                />
            </ItemGroup>

            {/* Component Demos */}
            <ItemGroup title={t('devTools.componentDemos')}>
                <Item
                    title={t('devTools.deviceInfo')}
                    titleLines={0}
                    subtitle={t('devTools.deviceInfoSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="phone-portrait-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/device-info')}
                />
                <Item
                    title={t('devTools.listComponents')}
                    titleLines={0}
                    subtitle={t('devTools.listComponentsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="list-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/list-demo')}
                />
                <Item
                    title={t('devTools.typography')}
                    titleLines={0}
                    subtitle={t('devTools.typographySubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="text-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/typography')}
                />
                <Item
                    title={t('devTools.colors')}
                    titleLines={0}
                    subtitle={t('devTools.colorsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="color-palette-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/colors')}
                />
                <Item
                    title={t('devTools.messageDemos')}
                    titleLines={0}
                    subtitle={t('devTools.messageDemosSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="chatbubbles-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/messages-demo')}
                />
                <Item
                    title={t('devTools.invertedList')}
                    titleLines={0}
                    subtitle={t('devTools.invertedListSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="swap-vertical-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/inverted-list')}
                />
                <Item
                    title={t('devTools.toolViews')}
                    titleLines={0}
                    subtitle={t('devTools.toolViewsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="construct-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/tools2')}
                />
                <Item
                    title={t('devTools.shimmerView')}
                    titleLines={0}
                    subtitle={t('devTools.shimmerViewSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="sparkles-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/shimmer-demo')}
                />
                <Item
                    title={t('devTools.multiTextInput')}
                    titleLines={0}
                    subtitle={t('devTools.multiTextInputSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="create-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/multi-text-input')}
                />
                <Item
                    title={t('devTools.inputStyles')}
                    titleLines={0}
                    subtitle={t('devTools.inputStylesSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="color-palette-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/input-styles')}
                />
                <Item
                    title={t('devTools.modalSystem')}
                    titleLines={0}
                    subtitle={t('devTools.modalSystemSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="albums-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/modal-demo')}
                />
                <Item
                    title="Action Menu Demo"
                    subtitle="AgentHub glass menu states"
                    icon={<Ionicons name="ellipsis-horizontal-circle-outline" size={28} color={theme.colors.accent} />}
                    onPress={() => router.push('/dev/action-menu-demo')}
                />
                <Item
                    title="Code Surfaces"
                    subtitle="AgentHub code, terminal, and diff surfaces"
                    icon={<Ionicons name="terminal-outline" size={28} color={theme.colors.accent} />}
                    onPress={() => router.push('/dev/code-surfaces')}
                />
                <Item
                    title="Agent Input Demo"
                    subtitle="AgentHub composer states"
                    icon={<Ionicons name="send-outline" size={28} color={theme.colors.accent} />}
                    onPress={() => router.push('/dev/agent-input-demo')}
                />
                <Item
                    title={t('devTools.unitTests')}
                    titleLines={0}
                    subtitle={t('devTools.unitTestsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="flask-outline" size={28} color="#34C759" />}
                    onPress={() => router.push('/dev/tests')}
                />
                <Item
                    title={t('devTools.unistylesDemo')}
                    titleLines={0}
                    subtitle={t('devTools.unistylesDemoSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="brush-outline" size={28} color="#FF6B6B" />}
                    onPress={() => router.push('/dev/unistyles-demo')}
                />
                <Item
                    title={t('devTools.qrCodeTest')}
                    titleLines={0}
                    subtitle={t('devTools.qrCodeTestSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="qr-code-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/qr-test')}
                />
                <Item
                    title={t('devTools.sessionComposer')}
                    titleLines={0}
                    subtitle={t('devTools.sessionComposerSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="add-circle-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/session-composer')}
                />
            </ItemGroup>

            {/* Test Features */}
            <ItemGroup title={t('devTools.testFeatures')} footer={t('devTools.testFeaturesFooter')}>
                <Item
                    title={t('devTools.testCrash')}
                    titleLines={0}
                    subtitle={t('devTools.testCrashSubtitle')}
                    subtitleLines={0}
                    destructive={true}
                    icon={<Ionicons name="warning-outline" size={28} color="#FF3B30" />}
                    onPress={async () => {
                        const confirmed = await Modal.confirm(
                            t('devTools.testCrash'),
                            t('devTools.testCrashConfirm'),
                            { confirmText: t('devTools.testCrash'), destructive: true }
                        );
                        if (confirmed) {
                            throw new Error('Test crash triggered from dev menu');
                        }
                    }}
                />
                <Item
                    title={t('devTools.clearCacheTitle')}
                    titleLines={0}
                    subtitle={t('devTools.clearCacheSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="trash-outline" size={28} color="#FF9500" />}
                    onPress={handleClearCache}
                />
                <Item
                    title={t('devTools.resetChangelogTitle')}
                    titleLines={0}
                    subtitle={t('devTools.resetChangelogSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="sparkles-outline" size={28} color="#007AFF" />}
                    onPress={() => {
                        const latest = getLatestVersion();
                        setLastViewedVersion(Math.max(0, latest - 1));
                        Modal.alert(t('common.done'), t('devTools.resetChangelogDone'));
                    }}
                />
                <Item
                    title={t('devTools.resetAppTitle')}
                    titleLines={0}
                    subtitle={t('devTools.resetAppSubtitle')}
                    subtitleLines={0}
                    destructive={true}
                    icon={<Ionicons name="refresh-outline" size={28} color="#FF3B30" />}
                    onPress={async () => {
                        const confirmed = await Modal.confirm(
                            t('devTools.resetAppTitle'),
                            t('devTools.resetAppConfirm'),
                            { confirmText: t('common.reset'), destructive: true }
                        );
                        if (confirmed) {
                            console.log('App state reset');
                        }
                    }}
                />
            </ItemGroup>

            {/* System */}
            <ItemGroup title={t('devTools.system')}>
                <Item
                    title={t('devTools.expoConstants')}
                    titleLines={0}
                    subtitle={t('devTools.expoConstantsSubtitle')}
                    subtitleLines={0}
                    icon={<Ionicons name="information-circle-outline" size={28} color="#007AFF" />}
                    onPress={() => router.push('/dev/expo-constants')}
                />
            </ItemGroup>

            {/* Network */}
            <ItemGroup title={t('devTools.network')}>
                <Item
                    title={t('devTools.apiEndpoint')}
                    detail={getServerUrl()}
                    onPress={handleEditServerUrl}
                    detailStyle={{ flex: 1, textAlign: 'right', minWidth: '70%' }}
                />
                <Item
                    title={t('devTools.logServer')}
                    titleLines={0}
                    subtitle={t('devTools.logServerSubtitle')}
                    subtitleLines={0}
                    detail={getLogServerUrl() || t('devTools.off')}
                    onPress={handleEditLogServerUrl}
                    detailStyle={{ flex: 1, textAlign: 'right', minWidth: '50%' }}
                />
                <Item
                    title={t('devTools.socketIoStatus')}
                    titleLines={0}
                    subtitle={getSocketStatusSubtitle()}
                    subtitleLines={0}
                    detail={socketStatus.status}
                    rightElement={<SocketStatusIndicator />}
                    showChevron={false}
                />
            </ItemGroup>
        </ItemList>
    );
}
