import * as React from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import {
    formatShortcut,
    GLOBAL_SHORTCUTS,
    type GlobalShortcutId,
    type ShortcutModifier,
} from '@/keyboard/shortcuts';

interface ShortcutHintsContextValue {
    modifier: ShortcutModifier | null;
    visible: boolean;
    browserSafeShortcuts: boolean;
}

const ShortcutHintsContext = React.createContext<ShortcutHintsContextValue>({
    modifier: null,
    visible: false,
    browserSafeShortcuts: false,
});

const styles = StyleSheet.create((theme) => ({
    overlay: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        zIndex: 2000,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 6,
        maxWidth: 520,
        padding: 8,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    overlayItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 9,
        backgroundColor: theme.colors.surfaceHigh,
    },
    overlayLabel: { ...Typography.default('semiBold'), color: theme.colors.text, fontSize: 12 },
    keycap: {
        minWidth: 30,
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    keycapText: { ...Typography.mono(), color: theme.colors.text, fontSize: 11, fontWeight: '600' },
    badge: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: theme.colors.surfaceHighest,
    },
    badgeText: { ...Typography.mono(), color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700' },
}));

const labels: Record<GlobalShortcutId, () => string> = {
    commandPalette: () => t('settingsFeatures.commandPalette'),
    newSession: () => t('project.newSession'),
    settings: () => t('settings.title'),
};

export function useShortcutHints() {
    return React.useContext(ShortcutHintsContext);
}

export function ShortcutHintsProvider(props: {
    modifier: ShortcutModifier | null;
    commandPaletteEnabled: boolean;
    browserSafeShortcuts: boolean;
    children: React.ReactNode;
}) {
    const visible = Platform.OS === 'web' && props.modifier !== null;
    const value = React.useMemo(() => ({
        modifier: props.modifier,
        visible,
        browserSafeShortcuts: props.browserSafeShortcuts,
    }), [props.browserSafeShortcuts, props.modifier, visible]);

    return (
        <ShortcutHintsContext.Provider value={value}>
            {props.children}
            {visible && props.modifier ? (
                <View pointerEvents="none" style={styles.overlay} testID="shortcut-hints-overlay" accessibilityLiveRegion="polite">
                    {GLOBAL_SHORTCUTS
                        .filter((shortcut) => shortcut.id !== 'commandPalette' || props.commandPaletteEnabled)
                        .map((shortcut) => (
                            <View key={shortcut.id} style={styles.overlayItem}>
                                <View style={styles.keycap}>
                                    <Text style={styles.keycapText}>{formatShortcut(props.modifier!, shortcut.keyLabel, props.browserSafeShortcuts)}</Text>
                                </View>
                                <Text style={styles.overlayLabel}>{labels[shortcut.id]()}</Text>
                            </View>
                        ))}
                </View>
            ) : null}
        </ShortcutHintsContext.Provider>
    );
}

export function ShortcutHintBadge(props: { shortcutKey: string; style?: StyleProp<ViewStyle> }) {
    const hints = useShortcutHints();
    if (!hints.visible || !hints.modifier) return null;
    return (
        <View pointerEvents="none" style={[styles.badge, props.style]}>
            <Text style={styles.badgeText}>{formatShortcut(hints.modifier, props.shortcutKey, hints.browserSafeShortcuts)}</Text>
        </View>
    );
}
