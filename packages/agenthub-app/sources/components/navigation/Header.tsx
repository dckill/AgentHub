import * as React from 'react';
import { View, Text, Platform, StatusBar, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { layout } from '../layout';
import { useHeaderHeight, useIsTablet } from '@/utils/responsive';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { getNavigationHeaderVisuals } from '@/components/navigationShellVisuals';
import { t } from '@/text';
import { MobileGlassSurface } from '../MobileGlass';
import { isRunningOnMac } from '@/utils/platform';

interface HeaderProps {
    title?: React.ReactNode;
    subtitle?: string;
    headerLeft?: (() => React.ReactNode) | null;
    headerRight?: (() => React.ReactNode) | null;
    headerStyle?: any;
    headerTitleStyle?: any;
    headerSubtitleStyle?: any;
    headerTintColor?: string;
    headerBackgroundColor?: string;
    headerShadowVisible?: boolean;
    headerTransparent?: boolean;
    safeAreaEnabled?: boolean;
}

export const Header = React.memo((props: HeaderProps) => {
    const styles = stylesheet;

    const {
        title,
        subtitle,
        headerLeft,
        headerRight,
        headerStyle,
        headerTitleStyle,
        headerSubtitleStyle,
        headerTintColor, // Accept but ignore - using theme instead
        headerBackgroundColor, // Accept but ignore - using theme instead
        headerShadowVisible = true,
        headerTransparent = false,
        safeAreaEnabled = true,
    } = props;

    const insets = useSafeAreaInsets();
    const paddingTop = safeAreaEnabled ? insets.top : 0;
    const headerHeight = useHeaderHeight();
    const isTablet = useIsTablet();
    const { theme } = useUnistyles();
    const headerVisuals = getNavigationHeaderVisuals(theme);
    const mobileGlassEnabled = !isTablet && Platform.OS !== 'web' && !isRunningOnMac();

    const containerStyle = [
        styles.container,
        headerTransparent && styles.containerTransparent,
        !headerTransparent && styles.containerNormal,
        mobileGlassEnabled && styles.containerMobileGlass,
        {
            paddingTop,
            borderBottomColor: headerVisuals.borderColor,
        },
        headerShadowVisible && styles.shadow,
        headerStyle,
    ];

    const subtitleStyle = [
        styles.subtitle,
        headerSubtitleStyle,
    ];

    return (
        <View role="banner" style={[containerStyle]}>
            {mobileGlassEnabled && (
                <MobileGlassSurface
                    enabled
                    nativeEffect
                    material="static"
                    intensity={48}
                    style={StyleSheet.absoluteFill}
                />
            )}
            {!headerTransparent && !mobileGlassEnabled && <View style={styles.highlight} />}
            <View style={styles.contentWrapper}>
                <View style={[styles.content, { height: headerHeight }]}>
                    <View style={styles.leftContainer}>
                        {headerLeft?.()}
                    </View>

                    <View style={styles.centerContainer}>
                        {title}
                        {subtitle && <Text style={subtitleStyle} numberOfLines={1}>{subtitle}</Text>}
                    </View>

                    <View style={styles.rightContainer}>
                        {headerRight?.()}
                    </View>
                </View>
            </View>
        </View>
    );
});

// Extended navigation options to support subtitle
interface ExtendedNavigationOptions extends Partial<NativeStackHeaderProps['options']> {
    headerSubtitle?: string;
    headerSubtitleStyle?: any;
}

// Default back button component
const DefaultBackButton: React.FC<{ tintColor?: string; onPress: () => void; accessibilityLabel: string }> = ({ tintColor = '#000', onPress, accessibilityLabel }) => {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            hitSlop={15}
            style={stylesheet.backButton}
        >
            <Ionicons
                name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                size={24}
                color={tintColor}
            />
        </Pressable>
    );
};

// Component wrapper for navigation header
const NavigationHeaderComponent: React.FC<NativeStackHeaderProps> = React.memo((props) => {
    const { options, route, back, navigation } = props;
    const { theme } = useUnistyles();
    const extendedOptions = options as ExtendedNavigationOptions;
    const isTablet = useIsTablet();
    const headerVisuals = getNavigationHeaderVisuals(theme);
    const tintColor = options.headerTintColor ?? headerVisuals.tintColor;

    // Check if we should hide back button on tablet
    const shouldHideBackButton = React.useMemo(() => {
        if (!isTablet) return false;

        // Get navigation state to check stack depth
        const state = navigation.getState();
        const currentIndex = state?.index ?? 0;

        // Hide back button if we're at the first or second screen in the stack
        // In tablet mode, index 0 is the empty screen, index 1 is the first real screen
        return currentIndex <= 1;
    }, [isTablet, navigation]);

    // Extract title - handle both string and function types
    let title: React.ReactNode | null = null;
    if (options.headerTitle) {
        if (typeof options.headerTitle === 'string') {
            title = (
                <Text style={[
                    { fontSize: 17, fontWeight: '600', textAlign: Platform.OS === 'ios' ? 'center' : 'left', color: tintColor },
                    Typography.default('semiBold'),
                    options.headerTitleStyle
                ]}>
                    {options.headerTitle}
                </Text>
            );
        } else if (typeof options.headerTitle === 'function') {
            // Handle function type headerTitle
            title = options.headerTitle({ children: route.name, tintColor });
        }
    } else if (typeof options.title === 'string') {
        title = (
            <Text style={[
                { fontSize: 17, fontWeight: '600', textAlign: Platform.OS === 'ios' ? 'center' : 'left', color: tintColor },
                Typography.default('semiBold'),
                options.headerTitleStyle
            ]}>
                {options.title}
            </Text>
        );
    }

    // Determine header left content
    let headerLeftContent: (() => React.ReactNode) | undefined | null = null;
    if (options.headerLeft) {
        // Use custom headerLeft if provided
        headerLeftContent = () => options.headerLeft!({ canGoBack: !!back, tintColor });
    } else if (back && options.headerBackVisible !== false && !shouldHideBackButton) {
        // Show default back button if can go back and not explicitly hidden
        // Also hide on tablet when at first or second screen
        headerLeftContent = () => (
            <DefaultBackButton
                tintColor={tintColor}
                accessibilityLabel={options.headerBackTitle ?? back.title ?? t('common.back')}
                onPress={() => navigation.goBack()}
            />
        );
    }

    return (
        <Header
            title={title}
            subtitle={extendedOptions.headerSubtitle}
            headerLeft={headerLeftContent}
            headerRight={options.headerRight ?
                () => options.headerRight!({ canGoBack: !!back, tintColor }) :
                undefined
            }
            headerStyle={options.headerStyle}
            headerTitleStyle={options.headerTitleStyle}
            headerSubtitleStyle={extendedOptions.headerSubtitleStyle}
            headerShadowVisible={options.headerShadowVisible}
            headerTransparent={options.headerTransparent}
        />
    );
});

// Export a render function for React Navigation
export const createHeader = (props: NativeStackHeaderProps) => {
    if (props.options.headerShown === false) {
        return null;
    }
    return <NavigationHeaderComponent {...props} />;
};

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        position: 'relative',
        zIndex: 100,
    },
    containerTransparent: {
        backgroundColor: theme.colors.header.background,
    },
    containerNormal: {
        backgroundColor: theme.colors.glass.raised,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    containerMobileGlass: {
        backgroundColor: 'transparent',
        borderBottomWidth: 0,
    },
    highlight: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.glass.highlight,
    },
    contentWrapper: {
        width: '100%',
        alignItems: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.select({ ios: 8, default: 16 }),
        width: '100%',
        maxWidth: layout.headerMaxWidth,
        position: 'relative',
    },
    leftContainer: {
        zIndex: 2,
        flexGrow: 0,
        flexShrink: 0,
        alignItems: 'flex-start',
    },
    centerContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 1,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 84,
        pointerEvents: 'none',
    },
    rightContainer: {
        zIndex: 2,
        marginLeft: 'auto',
        flexGrow: 0,
        flexShrink: 0,
        alignItems: 'flex-end',
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        textAlign: 'center',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '400',
        textAlign: Platform.OS === 'ios' ? 'center' : 'left',
        marginTop: 2,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    shadow: {
        shadowColor: theme.colors.glass.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: theme.dark ? 0.28 : 0.16,
        shadowRadius: 10,
        elevation: 4,
        boxShadow: theme.dark
            ? '0 10px 26px rgba(0, 0, 0, 0.28)'
            : '0 10px 24px rgba(40, 45, 49, 0.10)',
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));
