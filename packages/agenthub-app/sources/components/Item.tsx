import * as React from 'react';
import { 
    View, 
    Text, 
    Pressable, 
    StyleProp, 
    ViewStyle, 
    TextStyle,
    Platform,
    ActivityIndicator
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';
import { t } from '@/text';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useItemScale } from '@/components/ItemScaleContext';
import { getAccessibleActionProps } from './accessibilityProps';
import { shouldSplitInteractiveItem } from './itemLayout';

export interface ItemProps {
    title: string;
    titleLines?: number; // set 0 for auto/multiline
    subtitle?: string;
    subtitleLines?: number; // set 0 or undefined for auto/multiline
    detail?: string;
    icon?: React.ReactNode;
    leftElement?: React.ReactNode;
    rightElement?: React.ReactNode;
    rightElementInteractive?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    loading?: boolean;
    selected?: boolean;
    destructive?: boolean;
    style?: StyleProp<ViewStyle>;
    titleStyle?: StyleProp<TextStyle>;
    subtitleStyle?: StyleProp<TextStyle>;
    detailStyle?: StyleProp<TextStyle>;
    showChevron?: boolean;
    showDivider?: boolean;
    dividerInset?: number;
    pressableStyle?: StyleProp<ViewStyle>;
    copy?: boolean | string;
}

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        minHeight: Platform.select({ ios: 44, default: 56 }),
    },
    containerWithSubtitle: {
        paddingVertical: Platform.select({ ios: 11, default: 16 }),
    },
    containerWithoutSubtitle: {
        paddingVertical: Platform.select({ ios: 12, default: 16 }),
    },
    iconContainer: {
        marginRight: 12,
        width: Platform.select({ ios: 29, default: 32 }),
        height: Platform.select({ ios: 29, default: 32 }),
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        ...Typography.default('regular'),
        fontSize: Platform.select({ ios: 17, default: 16 }),
        lineHeight: Platform.select({ ios: 22, default: 24 }),
        letterSpacing: Platform.select({ ios: -0.41, default: 0.15 }),
    },
    titleNormal: {
        color: theme.colors.text,
    },
    titleSelected: {
        color: theme.colors.text,
    },
    titleDestructive: {
        color: theme.colors.textDestructive,
    },
    subtitle: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: Platform.select({ ios: 15, default: 14 }),
        lineHeight: 20,
        letterSpacing: Platform.select({ ios: -0.24, default: 0.1 }),
        marginTop: Platform.select({ ios: 2, default: 0 }),
    },
    rightSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 8,
    },
    detail: {
        ...Typography.default('regular'),
        color: theme.colors.textSecondary,
        fontSize: 17,
        letterSpacing: -0.41,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    pressablePressed: {
        backgroundColor: theme.colors.surfacePressedOverlay,
    },
    splitItemContainer: {
        position: 'relative',
    },
    interactiveRightElement: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 1,
        paddingRight: 16,
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1,
    },
}));

function renderScaledIcon(icon: React.ReactNode, s: (base: number) => number): React.ReactNode {
    if (!React.isValidElement(icon)) {
        return icon;
    }

    const props = icon.props as { size?: unknown };
    if (typeof props.size !== 'number') {
        return icon;
    }

    return React.cloneElement(icon as React.ReactElement<any>, {
        size: s(props.size),
    });
}

export const Item = React.memo<ItemProps>((props) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const s = useItemScale();
    
    // Platform-specific measurements
    const isIOS = Platform.OS === 'ios';
    const isAndroid = Platform.OS === 'android';
    const isWeb = Platform.OS === 'web';
    const iconBoxSize = (isIOS && !isWeb) ? s(29) : s(32);
    
    // Timer ref for long press copy functionality
    const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const {
        title,
        titleLines,
        subtitle,
        subtitleLines,
        detail,
        icon,
        leftElement,
        rightElement,
        rightElementInteractive = false,
        onPress,
        onLongPress,
        disabled,
        loading,
        selected,
        destructive,
        style,
        titleStyle,
        subtitleStyle,
        detailStyle,
        showChevron = true,
        showDivider = true,
        dividerInset = isIOS ? 15 : 16,
        pressableStyle,
        copy
    } = props;
    const effectiveTitleLines = titleLines !== undefined
        ? (titleLines <= 0 ? undefined : titleLines)
        : (subtitle ? 1 : 2);

    // Handle copy functionality
    const handleCopy = React.useCallback(async () => {
        if (!copy || isWeb) return;
        
        let textToCopy: string;
        
        if (typeof copy === 'string') {
            // If copy is a string, use it directly
            textToCopy = copy;
        } else {
            // If copy is true, try to figure out what to copy
            // Priority: detail > subtitle > title
            textToCopy = detail || subtitle || title;
        }
        
        try {
            await Clipboard.setStringAsync(textToCopy);
            Modal.alert(t('common.copied'), t('items.copiedToClipboard', { label: title }));
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }, [copy, isWeb, title, subtitle, detail]);
    
    // Handle long press for copy functionality
    const handlePressIn = React.useCallback(() => {
        if (copy && !isWeb && !onPress) {
            longPressTimer.current = setTimeout(() => {
                handleCopy();
            }, 500); // 500ms delay for long press
        }
    }, [copy, isWeb, onPress, handleCopy]);
    
    const handlePressOut = React.useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);
    
    // Clean up timer on unmount
    React.useEffect(() => {
        return () => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
            }
        };
    }, []);
    
    // If copy is enabled and no onPress is provided, don't set a regular press handler
    // The copy will be handled by long press instead
    const handlePress = onPress;
    
    const isInteractive = handlePress || onLongPress || (copy && !isWeb);
    const splitInteractiveItem = shouldSplitInteractiveItem({
        hasRowPress: Boolean(handlePress),
        hasRightElement: Boolean(rightElement),
        rightElementInteractive,
    });
    const showAccessory = isInteractive && showChevron && !rightElement;
    const chevronSize = (isIOS && !isWeb) ? s(17) : s(24);

    const titleColor = destructive ? styles.titleDestructive : (selected ? styles.titleSelected : styles.titleNormal);
    const containerPadding = subtitle ? styles.containerWithSubtitle : styles.containerWithoutSubtitle;
    
    const content = (
        <>
            <View style={[
                styles.container,
                {
                    paddingHorizontal: s(16),
                    minHeight: Platform.select({ ios: s(44), default: s(56) }),
                },
                containerPadding,
                subtitle
                    ? { paddingVertical: Platform.select({ ios: s(11), default: s(16) }) }
                    : { paddingVertical: Platform.select({ ios: s(12), default: s(16) }) },
                style
            ]}>
                {/* Left Section */}
                {(icon || leftElement) && (
                    <View style={[
                        styles.iconContainer,
                        {
                            marginRight: s(12),
                            width: iconBoxSize,
                            height: iconBoxSize,
                        }
                    ]}>
                        {leftElement || renderScaledIcon(icon, s)}
                    </View>
                )}

                {/* Center Section */}
                <View style={styles.centerContent}>
                    <Text 
                        style={[
                            styles.title,
                            {
                                fontSize: Platform.select({ ios: s(17), default: s(16) }),
                                lineHeight: Platform.select({ ios: s(22), default: s(24) }),
                            },
                            titleColor,
                            titleStyle
                        ]}
                        numberOfLines={effectiveTitleLines}
                    >
                        {title}
                    </Text>
                    {subtitle && (() => {
                        // Allow multiline when requested or when content contains line breaks
                        const effectiveLines = subtitleLines !== undefined
                            ? (subtitleLines <= 0 ? undefined : subtitleLines)
                            : (typeof subtitle === 'string' && subtitle.indexOf('\n') !== -1 ? undefined : 1);
                        return (
                            <Text
                                style={[
                                    styles.subtitle,
                                    {
                                        fontSize: Platform.select({ ios: s(15), default: s(14) }),
                                        lineHeight: s(20),
                                        marginTop: Platform.select({ ios: s(2), default: 0 }),
                                    },
                                    subtitleStyle
                                ]}
                                numberOfLines={effectiveLines}
                            >
                                {subtitle}
                            </Text>
                        );
                    })()}
                </View>

                {/* Right Section */}
                <View style={[styles.rightSection, { marginLeft: s(8) }]}>
                    {detail && !rightElement && (
                        <Text 
                            style={[
                                styles.detail, 
                                {
                                    marginRight: showAccessory ? s(6) : 0,
                                    fontSize: s(17),
                                },
                                detailStyle
                            ]}
                            numberOfLines={1}
                        >
                            {detail}
                        </Text>
                    )}
                    {loading && (
                        <ActivityIndicator 
                            size="small" 
                            color={theme.colors.textSecondary}
                            style={{ marginRight: showAccessory ? s(6) : 0 }}
                        />
                    )}
                    {!splitInteractiveItem && rightElement}
                    {showAccessory && (
                        <Ionicons 
                            name="chevron-forward" 
                            size={chevronSize} 
                            color={theme.colors.groupped.chevron}
                            style={{ marginLeft: s(4) }}
                        />
                    )}
                </View>
            </View>

            {/* Divider */}
            {showDivider && (
                <View 
                    style={[
                        styles.divider,
                        { 
                            marginLeft: (isAndroid || isWeb)
                                ? s(16)
                                : (s(dividerInset) + (icon || leftElement ? (s(16) + iconBoxSize + s(15)) : s(16)))
                        }
                    ]}
                />
            )}
        </>
    );

    if (isInteractive) {
        const interactivePressable = (
            <Pressable
                {...getAccessibleActionProps(title, {
                    ...(disabled || loading ? { disabled: true } : {}),
                    ...(selected !== undefined ? { selected } : {}),
                })}
                onPress={handlePress}
                onLongPress={onLongPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={disabled || loading}
                style={({ pressed }) => [
                    {
                        backgroundColor: pressed && isIOS && !isWeb ? theme.colors.surfacePressedOverlay : 'transparent',
                        opacity: disabled ? 0.5 : 1
                    },
                    pressableStyle
                ]}
                android_ripple={(isAndroid || isWeb) ? {
                    color: theme.colors.surfaceRipple,
                    borderless: false,
                    foreground: true
                } : undefined}
            >
                {content}
            </Pressable>
        );

        if (splitInteractiveItem) {
            return (
                <View style={styles.splitItemContainer}>
                    {interactivePressable}
                    <View style={styles.interactiveRightElement}>
                        {rightElement}
                    </View>
                </View>
            );
        }

        return interactivePressable;
    }

    return <View style={[{ opacity: disabled ? 0.5 : 1 }, pressableStyle]}>{content}</View>;
});
