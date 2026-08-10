import * as React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { useHeaderHeight, useIsTablet } from '@/utils/responsive';
import { layout } from '@/components/layout';
import { useUnistyles } from 'react-native-unistyles';
import { getChatHeaderVisuals } from './chatShellVisuals';
import type { SessionLifecycleVisual } from '@/utils/sessionLifecycleStatus';
import { MobileGlassSurface } from './MobileGlass';
import { isRunningOnMac } from '@/utils/platform';

interface ChatHeaderViewProps {
    title: string;
    subtitle?: string;
    agentLabel?: string;
    onBackPress?: () => void;
    backgroundColor?: string;
    tintColor?: string;
    isConnected?: boolean;
    onSidebarTogglePress?: () => void;
    sidebarCollapsed?: boolean;
    onExplorerTogglePress?: () => void;
    explorerOpen?: boolean;
    onDetailsPress?: () => void;
    lifecycleStatus?: Pick<SessionLifecycleVisual, 'tone' | 'icon' | 'accessible' | 'accessibilityLiveRegion'> & { label: string };
}

export const ChatHeaderView: React.FC<ChatHeaderViewProps> = ({
    title,
    subtitle,
    onBackPress,
    onSidebarTogglePress,
    sidebarCollapsed,
    onExplorerTogglePress,
    explorerOpen,
    onDetailsPress,
    agentLabel,
    lifecycleStatus,
}) => {
    const { theme } = useUnistyles();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const isTablet = useIsTablet();
    const headerVisuals = getChatHeaderVisuals(theme);
    const mobileGlassEnabled = !isTablet && Platform.OS !== 'web' && !isRunningOnMac();

    const handleBackPress = () => {
        if (onBackPress) {
            onBackPress();
        } else {
            navigation.goBack();
        }
    };

    return (
        <View
            style={[
                styles.container,
                {
                    paddingTop: insets.top,
                    backgroundColor: mobileGlassEnabled ? 'transparent' : headerVisuals.backgroundColor,
                    borderBottomColor: headerVisuals.borderColor,
                    shadowColor: headerVisuals.shadowColor,
                },
            ]}
        >
            {mobileGlassEnabled && (
                <MobileGlassSurface enabled nativeEffect material="static" intensity={52} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient
                pointerEvents="none"
                colors={[
                    theme.colors.glass.reflection,
                    theme.dark ? 'rgba(255, 255, 255, 0.018)' : 'rgba(255, 255, 255, 0.16)',
                    'rgba(255, 255, 255, 0)',
                ]}
                locations={[0, 0.34, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.92, y: 0.82 }}
                style={styles.headerSheen}
            />
            <View
                pointerEvents="none"
                style={[
                    styles.headerTopEdge,
                    { backgroundColor: theme.colors.glass.edgeBright },
                ]}
            />
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(0, 0, 0, 0)', theme.dark ? 'rgba(0, 0, 0, 0.18)' : 'rgba(70, 48, 16, 0.035)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.headerBottomShade}
            />
            <View style={styles.contentWrapper}>
                <View style={[styles.content, { height: headerHeight }]}>
                    <Pressable
                        onPress={handleBackPress}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.back')}
                        style={styles.backButton}
                        hitSlop={15}
                    >
                        <Ionicons
                            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                            size={Platform.select({ ios: 28, default: 24 })}
                            color={headerVisuals.tintColor}
                        />
                    </Pressable>

                    <View style={styles.titleContainer}>
                        <View style={styles.titleRow}>
                            <Text
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                style={[
                                    styles.title,
                                    {
                                        color: headerVisuals.tintColor,
                                        ...Typography.default('semiBold')
                                    }
                                ]}
                            >
                                {title}
                            </Text>
                        </View>
                        {(!!agentLabel || !!lifecycleStatus || (!agentLabel && !!subtitle)) && (
                            <View style={styles.metadataRow}>
                                {!!agentLabel && (
                                    <View style={[styles.agentPill, { borderColor: headerVisuals.borderColor, backgroundColor: theme.colors.accentSoft }]}>
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                styles.agentPillText,
                                                {
                                                    color: headerVisuals.mutedColor,
                                                    ...Typography.default('semiBold')
                                                }
                                            ]}
                                        >
                                            {agentLabel}
                                        </Text>
                                    </View>
                                )}
                                {!!lifecycleStatus && (
                                    <View
                                        accessibilityRole="text"
                                        accessible={lifecycleStatus.accessible}
                                        accessibilityLiveRegion={lifecycleStatus.accessibilityLiveRegion}
                                        accessibilityLabel={lifecycleStatus.label}
                                        style={[
                                            styles.lifecyclePill,
                                            {
                                                borderColor: headerVisuals.borderColor,
                                                backgroundColor: lifecycleStatus.tone === 'warning'
                                                    ? theme.colors.accentSoft
                                                    : lifecycleStatus.tone === 'success'
                                                        ? 'rgba(52, 199, 89, 0.12)'
                                                        : theme.colors.glass.background,
                                            },
                                        ]}
                                    >
                                        <Ionicons
                                            name={lifecycleStatus.icon}
                                            size={11}
                                            color={lifecycleStatus.tone === 'warning' ? theme.colors.warning : lifecycleStatus.tone === 'success' ? theme.colors.success : headerVisuals.mutedColor}
                                        />
                                        <Text numberOfLines={1} style={[styles.lifecyclePillText, { color: headerVisuals.mutedColor }]}>
                                            {lifecycleStatus.label}
                                        </Text>
                                    </View>
                                )}
                                {!agentLabel && subtitle && (
                                    <Text
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        style={[
                                            styles.subtitle,
                                            {
                                                color: headerVisuals.tintColor,
                                                opacity: 0.7,
                                                ...Typography.default()
                                            }
                                        ]}
                                    >
                                        {subtitle}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>

                    {onExplorerTogglePress && (
                        <Pressable
                            onPress={onExplorerTogglePress}
                            accessibilityRole="button"
                            hitSlop={10}
                            style={styles.headerActionButton}
                            accessibilityLabel={explorerOpen ? t('files.hideExplorer') : t('files.showExplorer')}
                        >
                            <Ionicons
                                name={explorerOpen ? 'folder-open' : 'folder-outline'}
                                size={22}
                                color={headerVisuals.tintColor}
                            />
                            <Text style={[styles.headerActionLabel, { color: headerVisuals.tintColor }]}>
                                {t('common.files')}
                            </Text>
                        </Pressable>
                    )}

                    {onDetailsPress && (
                        <Pressable
                            onPress={onDetailsPress}
                            accessibilityRole="button"
                            hitSlop={10}
                            style={styles.headerActionButton}
                            accessibilityLabel={t('common.details')}
                        >
                            <Ionicons
                                name="reader-outline"
                                size={22}
                                color={headerVisuals.tintColor}
                            />
                            <Text style={[styles.headerActionLabel, { color: headerVisuals.tintColor }]}>
                                {t('common.details')}
                            </Text>
                        </Pressable>
                    )}

                    {onSidebarTogglePress && (
                        <Pressable
                            onPress={onSidebarTogglePress}
                            accessibilityRole="button"
                            hitSlop={10}
                            style={styles.headerIconButton}
                            accessibilityLabel={sidebarCollapsed ? t('files.showExplorer') : t('files.hideExplorer')}
                        >
                            <Ionicons
                                name={sidebarCollapsed ? 'albums-outline' : 'albums'}
                                size={22}
                                color={headerVisuals.tintColor}
                            />
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        zIndex: 100,
        borderBottomWidth: StyleSheet.hairlineWidth,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        elevation: 8,
    },
    contentWrapper: {
        width: '100%',
        alignItems: 'center',
        position: 'relative',
    },
    headerSheen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.44,
    },
    headerTopEdge: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
    },
    headerBottomShade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 18,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.OS === 'ios' ? 8 : 16,
        width: '100%',
        maxWidth: layout.headerMaxWidth,
    },
    backButton: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    titleContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'flex-start',
        minWidth: 0,
    },
    title: {
        fontSize: Platform.select({
            ios: 15,
            android: 15,
            default: 16
        }),
        fontWeight: '600',
        flex: 1,
        minWidth: 0,
    },
    titleRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
    },
    metadataRow: {
        height: 18,
        marginTop: 2,
        width: '100%',
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        overflow: 'hidden',
    },
    agentPill: {
        height: 18,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 6,
        justifyContent: 'center',
        flexShrink: 0,
        maxWidth: 92,
    },
    agentPillText: {
        fontSize: 10,
        lineHeight: 12,
        letterSpacing: 0,
    },
    lifecyclePill: {
        height: 18,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 1,
        minWidth: 0,
        maxWidth: 180,
    },
    lifecyclePillText: {
        fontSize: 10,
        lineHeight: 12,
        flexShrink: 1,
        minWidth: 0,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        fontSize: 12,
        fontWeight: '400',
        lineHeight: 14,
        flexShrink: 1,
        minWidth: 0,
    },
    headerIconButton: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
    },
    headerActionButton: {
        minWidth: 52,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
        borderRadius: 10,
    },
    headerActionLabel: {
        ...Typography.default('semiBold'),
        fontSize: 10,
        lineHeight: 12,
        marginTop: 1,
        opacity: 0.8,
    },
});
