import { useSocketStatus, useSettings } from '@/sync/storage';
import * as React from 'react';
import { Text, View, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from '@/utils/responsive';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { MainView } from './MainView';
import { Image } from 'expo-image';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import Ionicons from '@expo/vector-icons/Ionicons';
import { isTauri } from '@/utils/isTauri';
import { getAccessibleActionProps } from './accessibilityProps';
import { ShortcutHintBadge, useShortcutHints } from './ShortcutHints';

const TAURI_TRAFFIC_LIGHT_WIDTH = 72;

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        borderStyle: 'solid',
        backgroundColor: theme.colors.groupped.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: isTauri() ? TAURI_TRAFFIC_LIGHT_WIDTH + 16 : 16,
        paddingRight: 16,
        backgroundColor: theme.colors.groupped.background,
        position: 'relative',
    },
    logoContainer: {
        width: 32,
    },
    logo: {
        height: 24,
        width: 24,
    },
    titleContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
    },
    titleContainerLeft: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginLeft: 8,
        justifyContent: 'center',
    },
    titleText: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.header.tint,
        ...Typography.default('semiBold'),
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -2,
    },
    statusDot: {
        marginRight: 4,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    rightContainer: {
        marginLeft: 'auto',
        alignItems: 'flex-end',
        flexDirection: 'row',
        gap: 8,
    },
    navButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    navButtonShortcutActive: {
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceSelected,
    },
    navShortcutBadge: {
        position: 'absolute',
        right: -7,
        bottom: -4,
    },
    settingsButton: {
        color: theme.colors.header.tint,
    },
    notificationButton: {
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: theme.colors.status.error,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        ...Typography.default('semiBold'),
    },
    // Status colors
    statusConnected: {
        color: theme.colors.status.connected,
    },
    statusConnecting: {
        color: theme.colors.status.connecting,
    },
    statusDisconnected: {
        color: theme.colors.status.disconnected,
    },
    statusError: {
        color: theme.colors.status.error,
    },
    statusDefault: {
        color: theme.colors.status.default,
    },
    indicatorDot: {
        position: 'absolute',
        top: 0,
        right: -2,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.text,
    },
}));

export const SidebarView = React.memo(() => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const router = useRouter();
    const headerHeight = useHeaderHeight();
    const socketStatus = useSocketStatus();
    const settings = useSettings();
    const { visible: shortcutHintsVisible } = useShortcutHints();

    // Compute connection status once per render (theme-reactive, no stale memoization)
    const connectionStatus = (() => {
        const { status } = socketStatus;
        switch (status) {
            case 'connected':
                return {
                    color: styles.statusConnected.color,
                    isPulsing: false,
                    text: t('status.connected'),
                    textColor: theme.colors.textSecondary
                };
            case 'connecting':
                return {
                    color: styles.statusConnecting.color,
                    isPulsing: true,
                    text: t('status.connecting'),
                    textColor: styles.statusConnecting.color
                };
            case 'disconnected':
                return {
                    color: styles.statusDisconnected.color,
                    isPulsing: false,
                    text: t('status.disconnected'),
                    textColor: styles.statusDisconnected.color
                };
            case 'error':
                return {
                    color: styles.statusError.color,
                    isPulsing: false,
                    text: t('status.error'),
                    textColor: styles.statusError.color
                };
            default:
                return {
                    color: styles.statusDefault.color,
                    isPulsing: false,
                    text: '',
                    textColor: styles.statusDefault.color
                };
        }
    })();

    // Calculate sidebar width and determine title positioning
    // Uses same formula as SidebarNavigator.tsx:18 for consistency
    const { width: windowWidth } = useWindowDimensions();
    const sidebarWidth = Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);
    // With experiments: 5 icons (184px total), threshold 408px > max 360px → always left-justify
    // Without experiments: 4 icons (144px total), threshold 368px → left-justify below ~370px
    const shouldLeftJustify = settings.experiments || sidebarWidth < 370;

    // Title content used in both centered and left-justified modes (DRY)
    const titleContent = (
        <>
            <Text style={styles.titleText}>{t('sidebar.sessionsTitle')}</Text>
            {connectionStatus.text && (
                <View style={styles.statusContainer}>
                    <StatusDot
                        color={connectionStatus.color}
                        isPulsing={connectionStatus.isPulsing}
                        size={6}
                        style={styles.statusDot}
                    />
                    <Text style={[styles.statusText, { color: connectionStatus.textColor }]}>
                        {connectionStatus.text}
                    </Text>
                </View>
            )}
        </>
    );

    const inTauri = isTauri();
    return (
        <>
            <View
                role="navigation"
                accessibilityLabel={t('tabs.sessions')}
                style={[styles.container, { paddingTop: safeArea.top }]}
            >
                <View
                    style={[styles.header, { height: headerHeight }]}
                    {...(inTauri ? { dataSet: { tauriDragRegion: 'true' } } : {})}
                >
                    {!inTauri && (
                        <View style={styles.logoContainer}>
                            <Image
                                source={theme.dark ? require('@/assets/images/agenthub-logo-light.png') : require('@/assets/images/agenthub-logo-dark.png')}
                                contentFit="contain"
                                accessibilityLabel="AgentHub"
                                style={[styles.logo, { height: 24, width: 24 }]}
                            />
                        </View>
                    )}

                    {!inTauri && shouldLeftJustify && (
                        <View style={styles.titleContainerLeft}>
                            {titleContent}
                        </View>
                    )}

                    {/* Navigation icons — opt out of Tauri drag so Pressables remain clickable */}
                    <View
                        style={styles.rightContainer}
                        {...(inTauri ? { dataSet: { tauriDragRegion: 'false' } } : {})}
                    >
                        <Pressable
                            {...getAccessibleActionProps(t('tabs.machines'))}
                            onPress={() => router.push('/machines')}
                            hitSlop={15}
                            style={styles.navButton}
                        >
                            <Ionicons name="desktop-outline" size={24} color={theme.colors.header.tint} />
                        </Pressable>
                        <Pressable
                            {...getAccessibleActionProps(t('settings.title'))}
                            onPress={() => router.push('/settings')}
                            hitSlop={15}
                            style={[styles.navButton, shortcutHintsVisible && styles.navButtonShortcutActive]}
                        >
                            <Ionicons name="settings-outline" size={24} color={theme.colors.header.tint} />
                            <ShortcutHintBadge shortcutKey="," style={styles.navShortcutBadge} />
                        </Pressable>
                    </View>

                    {!inTauri && !shouldLeftJustify && (
                        <View style={styles.titleContainer}>
                            {titleContent}
                        </View>
                    )}
                </View>
                <MainView variant="sidebar" />
            </View>
        </>
    )
});
