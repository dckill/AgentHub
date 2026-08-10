import * as React from 'react';
import { Header } from './navigation/Header';
import { useSocketStatus } from '@/sync/storage';
import { Platform, Pressable, Text, View } from 'react-native';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { useRouter, useSegments } from 'expo-router';
import { getServerInfo } from '@/sync/serverConfig';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { agentHubBrand } from '@/brand/brand';
import { getNavigationHeaderVisuals } from './navigationShellVisuals';
import { getAccessibleActionProps } from './accessibilityProps';
import { ShortcutHintBadge, useShortcutHints } from './ShortcutHints';

const stylesheet = StyleSheet.create((theme, runtime) => ({
    headerButton: {
        // marginHorizontal: 4,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    headerButtonShortcutActive: {
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceSelected,
    },
    headerShortcutBadge: {
        position: 'absolute',
        top: -8,
        right: -12,
    },
    iconButton: {
        color: theme.colors.text,
    },
    logoContainer: {
        // marginHorizontal: 4,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        tintColor: theme.colors.text,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    titleText: {
        fontSize: 17,
        color: theme.colors.text,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    subtitleText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: -2,
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
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
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
    centeredTitle: {
        textAlign: Platform.OS === 'ios' ? 'center' : 'left',
        alignSelf: Platform.OS === 'ios' ? 'center' : 'flex-start',
        flex: 1,
    },
}));


export const HomeHeader = React.memo(() => {
    const { theme } = useUnistyles();
    const headerVisuals = getNavigationHeaderVisuals(theme);

    return (
        <View style={{ backgroundColor: headerVisuals.transparentBackgroundColor }}>
            <Header
                title={<HeaderTitleWithSubtitle />}
                headerRight={() => <HeaderRight />}
                headerLeft={() => <HeaderLeft />}
                headerShadowVisible={false}
                headerTransparent={true}
            />
        </View>
    )
})

export const HomeHeaderNotAuth = React.memo(() => {
    useSegments(); // Re-rendered automatically when screen navigates back
    const serverInfo = getServerInfo();
    const { theme } = useUnistyles();
    const headerVisuals = getNavigationHeaderVisuals(theme);
    return (
        <Header
            title={<HeaderTitleWithSubtitle subtitle={serverInfo.isCustom ? serverInfo.hostname + (serverInfo.port ? `:${serverInfo.port}` : '') : undefined} />}
            headerRight={() => <HeaderRightNotAuth />}
            headerLeft={() => <HeaderLeft />}
            headerShadowVisible={false}
            headerBackgroundColor={headerVisuals.transparentBackgroundColor}
        />
    )
});

function HeaderRight() {
    const router = useRouter();
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const headerVisuals = getNavigationHeaderVisuals(theme);
    const { visible: shortcutHintsVisible } = useShortcutHints();

    return (
        <Pressable
            {...getAccessibleActionProps(t('project.newSession'))}
            onPress={() => router.navigate('/new')}
            hitSlop={15}
            style={[styles.headerButton, shortcutHintsVisible && styles.headerButtonShortcutActive]}
        >
            <HeaderActionIcon name="add" size={28} color={headerVisuals.tintColor} />
            <ShortcutHintBadge shortcutKey="N" style={styles.headerShortcutBadge} />
        </Pressable>
    );
}

function HeaderRightNotAuth() {
    const router = useRouter();
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const headerVisuals = getNavigationHeaderVisuals(theme);


    return (
        <Pressable
            {...getAccessibleActionProps(t('server.serverConfiguration'))}
            onPress={() => router.push('/server')}
            hitSlop={15}
            style={styles.headerButton}
        >
            <HeaderActionIcon name="server" size={24} color={headerVisuals.tintColor} />
        </Pressable>
    );
}

function HeaderActionIcon(props: { name: 'add' | 'server'; size: number; color: string }) {
    const { name, size, color } = props;
    return (
        <Svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            pointerEvents="none"
        >
            {name === 'add' ? (
                <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            ) : (
                <>
                    <Path d="M4 5c0-1.66 3.58-3 8-3s8 1.34 8 3v14c0 1.66-3.58 3-8 3s-8-1.34-8-3V5Z" stroke={color} strokeWidth={1.6} />
                    <Path d="M4 5c0 1.66 3.58 3 8 3s8-1.34 8-3M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke={color} strokeWidth={1.6} />
                </>
            )}
        </Svg>
    );
}

function HeaderLeft() {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    return (
        <View style={styles.logoContainer}>
            <Image
                source={theme.dark ? require('@/assets/images/agenthub-logo-light.png') : require('@/assets/images/agenthub-logo-dark.png')}
                contentFit="contain"
                accessibilityLabel="AgentHub"
                style={[{ width: 24, height: 24 }]}
            />
        </View>
    );
}

function HeaderTitleWithSubtitle({ subtitle }: { subtitle?: string }) {
    const socketStatus = useSocketStatus();
    const styles = stylesheet;
    const { theme } = useUnistyles();

    // Get connection status styling (matching sessionUtils.ts pattern)
    const getConnectionStatus = () => {
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
                    textColor: theme.colors.textSecondary
                };
            case 'disconnected':
                return {
                    color: styles.statusDisconnected.color,
                    isPulsing: false,
                    text: t('status.disconnected'),
                    textColor: theme.colors.textSecondary
                };
            case 'error':
                return {
                    color: styles.statusError.color,
                    isPulsing: false,
                    text: t('status.error'),
                    textColor: theme.colors.textSecondary
                };
            default:
                return {
                    color: styles.statusDefault.color,
                    isPulsing: false,
                    text: '',
                    textColor: theme.colors.textSecondary
                };
        }
    };

    const hasCustomSubtitle = !!subtitle;
    const connectionStatus = getConnectionStatus();
    const showConnectionStatus = !hasCustomSubtitle && connectionStatus.text;

    return (
        <View style={styles.titleContainer}>
            <Text style={styles.titleText}>
                {agentHubBrand.shortName}
            </Text>
            {hasCustomSubtitle && (
                <Text style={styles.subtitleText}>
                    {subtitle}
                </Text>
            )}
            {showConnectionStatus && (
                <View
                    role="status"
                    accessible
                    accessibilityLabel={connectionStatus.text}
                    accessibilityLiveRegion="polite"
                    style={styles.statusContainer}
                >
                    <StatusDot
                        color={connectionStatus.color}
                        isPulsing={connectionStatus.isPulsing}
                        size={6}
                        style={styles.statusDot}
                    />
                    <Text style={[
                        styles.statusText,
                        { color: connectionStatus.textColor }
                    ]}>
                        {connectionStatus.text}
                    </Text>
                </View>
            )}
        </View>
    );
}
