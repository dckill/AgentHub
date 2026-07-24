import * as React from 'react';
import { Pressable, Modal as RNModal, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '@/constants/Typography';
import { GlassSurface } from '@/components/glass';
import { ActionMenuAnchor, getActionMenuPosition, getCenteredActionMenuFrame } from './actionMenuPosition';
import { getActionMenuItemVisuals, getActionMenuSurfaceVisuals } from './actionMenuVisuals';
import { getInitialActionMenuFocusIndex } from './actionMenuAccessibility';

export type { ActionMenuAnchor } from './actionMenuPosition';

export interface ActionMenuItem {
    id: string;
    label: string;
    icon?: keyof typeof Ionicons.glyphMap | string;
    onPress: () => void;
    destructive?: boolean;
    disabled?: boolean;
    selected?: boolean;
}

interface ActionMenuProps {
    anchor: ActionMenuAnchor | null;
    items: ActionMenuItem[];
    onClose: () => void;
    title?: string;
    visible: boolean;
}

const WEB_MENU_WIDTH = 232;
const WEB_MENU_ITEM_HEIGHT = 48;
const WEB_MENU_MARGIN = 12;
const NATIVE_MENU_MAX_WIDTH = 360;
const NATIVE_MENU_MARGIN = 24;

const stylesheet = StyleSheet.create((theme) => ({
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.dark ? 'rgba(0, 0, 0, 0.68)' : 'rgba(25, 28, 31, 0.34)',
    },
    cardShadow: {
        borderRadius: theme.borderRadius.xl,
        shadowOpacity: theme.dark ? 0.30 : 0.22,
        shadowRadius: 32,
        shadowOffset: {
            width: 0,
            height: 18,
        },
        elevation: 18,
    },
    cardSurface: {
        borderRadius: theme.borderRadius.xl,
        overflow: 'hidden',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: {
            width: 0,
            height: 0,
        },
        elevation: 0,
    },
    titleWrap: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        overflow: 'hidden',
    },
    menuItem: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        gap: 12,
    },
    menuItemPressed: {
        backgroundColor: theme.colors.surfaceHover,
    },
    menuItemSelected: {
        backgroundColor: theme.colors.accentSoft,
    },
    menuItemDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    menuItemLabel: {
        flex: 1,
        fontSize: 15,
        lineHeight: 20,
        ...Typography.default(),
    },
    checkSlot: {
        width: 22,
        alignItems: 'flex-end',
    },
    iconSlot: {
        width: 22,
        alignItems: 'center',
    },
    nativeContainer: {
        flex: 1,
    },
    nativeMenu: {
        position: 'absolute',
    },
    title: {
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 22,
        letterSpacing: 0,
        paddingHorizontal: 16,
        paddingTop: 15,
        paddingBottom: 13,
        ...Typography.default('semiBold'),
    },
    webContainer: {
        flex: 1,
    },
    webMenu: {
        position: 'absolute',
        width: WEB_MENU_WIDTH,
    },
    itemsScroll: {
        flexGrow: 0,
    },
}));

export function ActionMenu({
    anchor,
    items,
    onClose,
    title,
    visible,
}: ActionMenuProps) {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const itemRefs = React.useRef<Array<{ focus?: () => void } | null>>([]);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || !visible) {
            return;
        }

        const focusIndex = getInitialActionMenuFocusIndex(items);
        if (focusIndex < 0) {
            return;
        }

        const timer = setTimeout(() => itemRefs.current[focusIndex]?.focus?.(), 0);
        return () => clearTimeout(timer);
    }, [items, visible]);

    const position = React.useMemo(() => {
        if (!anchor) {
            return null;
        }

        return getActionMenuPosition({
            anchor,
            itemCount: items.length + (title ? 1 : 0),
            itemHeight: WEB_MENU_ITEM_HEIGHT,
            margin: WEB_MENU_MARGIN,
            menuWidth: WEB_MENU_WIDTH,
            viewportHeight: windowHeight,
            viewportWidth: windowWidth,
        });
    }, [anchor, items.length, title, windowHeight, windowWidth]);

    const nativeFrame = React.useMemo(() => {
        return getCenteredActionMenuFrame({
            estimatedHeight: (items.length + (title ? 1 : 0)) * WEB_MENU_ITEM_HEIGHT,
            margin: NATIVE_MENU_MARGIN,
            maxWidth: NATIVE_MENU_MAX_WIDTH,
            viewportHeight: windowHeight,
            viewportWidth: windowWidth,
        });
    }, [items.length, title, windowHeight, windowWidth]);

    const handleActionPress = React.useCallback((item: ActionMenuItem) => {
        if (item.disabled) {
            return;
        }
        onClose();
        item.onPress();
    }, [onClose]);

    if (!visible || !anchor || items.length === 0) {
        return null;
    }

    const surfaceVisuals = getActionMenuSurfaceVisuals(theme);

    const content = (
        <View
            style={[
                styles.cardShadow,
                {
                    backgroundColor: surfaceVisuals.backgroundColor,
                    shadowColor: surfaceVisuals.shadowColor,
                },
            ]}
        >
            <GlassSurface
                tone="floating"
                sheen="none"
                style={[
                    styles.cardSurface,
                    {
                        backgroundColor: surfaceVisuals.backgroundColor,
                        borderColor: surfaceVisuals.borderColor,
                    },
                ]}
            >
                <LinearGradient
                    pointerEvents="none"
                    colors={surfaceVisuals.backgroundGradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                {!!title && (
                    <View style={[styles.titleWrap, { backgroundColor: surfaceVisuals.headerBackgroundColor }]}>
                        <LinearGradient
                            pointerEvents="none"
                            colors={surfaceVisuals.headerGradientColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <Text style={[styles.title, { color: surfaceVisuals.titleColor }]} numberOfLines={1}>
                            {title}
                        </Text>
                    </View>
                )}
                <ScrollView style={styles.itemsScroll} keyboardShouldPersistTaps="handled">
                    {items.map((item, index) => {
                        const isLast = index === items.length - 1;
                        const itemVisuals = getActionMenuItemVisuals(theme, item);

                        return (
                            <Pressable
                                key={item.id}
                                ref={(node: any) => {
                                    itemRefs.current[index] = node;
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={item.label}
                                accessibilityState={itemVisuals.accessibilityState}
                                disabled={item.disabled}
                                onPress={() => handleActionPress(item)}
                                style={({ pressed }) => [
                                    styles.menuItem,
                                    !isLast && styles.menuItemDivider,
                                    item.selected && styles.menuItemSelected,
                                    { opacity: itemVisuals.opacity },
                                    pressed && !item.disabled && styles.menuItemPressed,
                                ]}
                            >
                                <View style={styles.iconSlot}>
                                    {item.icon ? (
                                        <Ionicons
                                            color={itemVisuals.iconColor}
                                            name={item.icon as keyof typeof Ionicons.glyphMap}
                                            size={18}
                                        />
                                    ) : null}
                                </View>
                                <Text numberOfLines={1} style={[styles.menuItemLabel, { color: itemVisuals.labelColor }]}>
                                    {item.label}
                                </Text>
                                <View style={styles.checkSlot}>
                                    {item.selected && (
                                        <Ionicons
                                            color={itemVisuals.checkColor}
                                            name="checkmark-circle"
                                            size={18}
                                        />
                                    )}
                                </View>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </GlassSurface>
        </View>
    );

    if (Platform.OS === 'web' && position) {
        return (
            <RNModal
                animationType="none"
                onRequestClose={onClose}
                transparent
                visible={visible}
            >
                <View style={styles.webContainer}>
                    <View
                        style={styles.backdrop}
                        {...({ 'aria-hidden': true, onClick: onClose } as any)}
                    />
                    <View
                        style={[
                            styles.webMenu,
                            {
                                left: position.left,
                                top: position.top,
                            },
                        ]}
                    >
                        {content}
                    </View>
                </View>
            </RNModal>
        );
    }

    return (
        <RNModal
            animationType="fade"
            onRequestClose={onClose}
            transparent
            visible={visible}
        >
            <View style={styles.nativeContainer}>
                <Pressable accessible={false} focusable={false} onPress={onClose} style={styles.backdrop} />
                <View
                    style={[
                        styles.nativeMenu,
                        {
                            left: nativeFrame.left,
                            top: nativeFrame.top,
                            width: nativeFrame.width,
                            maxHeight: nativeFrame.maxHeight,
                        },
                    ]}
                >
                    {content}
                </View>
            </View>
        </RNModal>
    );
}
