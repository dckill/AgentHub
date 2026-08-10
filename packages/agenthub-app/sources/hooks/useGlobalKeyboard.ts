import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
    getGlobalShortcutId,
    getPressedShortcutModifier,
    getRecentSessionShortcutIndex,
    type GlobalShortcutId,
    type ShortcutModifier,
} from '@/keyboard/shortcuts';

const SHORTCUT_HINT_DELAY_MS = 240;

export interface GlobalKeyboardActions {
    commandPalette?: () => void;
    newSession?: () => void;
    settings?: () => void;
    recentSession?: (index: number) => boolean;
}

export function useGlobalKeyboard(actions: GlobalKeyboardActions, browserSafeShortcuts = false) {
    const [visibleModifier, setVisibleModifier] = useState<ShortcutModifier | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    const hideShortcutHints = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setVisibleModifier(null);
    }, []);

    useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const modifier = getPressedShortcutModifier(e);
            if (modifier) {
                if (!e.repeat && !timerRef.current) {
                    timerRef.current = setTimeout(() => {
                        setVisibleModifier(modifier);
                        timerRef.current = null;
                    }, SHORTCUT_HINT_DELAY_MS);
                }
                return;
            }

            const recentIndex = getRecentSessionShortcutIndex(e, browserSafeShortcuts);
            if (recentIndex !== null && actionsRef.current.recentSession?.(recentIndex)) {
                e.preventDefault();
                e.stopPropagation();
                hideShortcutHints();
                return;
            }

            const shortcutId = getGlobalShortcutId(e, browserSafeShortcuts);
            const action = shortcutId ? actionsRef.current[shortcutId as GlobalShortcutId] : undefined;
            if (!action) return;
            e.preventDefault();
            e.stopPropagation();
            hideShortcutHints();
            action();
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Meta' || e.key === 'Control') hideShortcutHints();
        };

        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', hideShortcutHints);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', hideShortcutHints);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [browserSafeShortcuts, hideShortcutHints]);

    return visibleModifier;
}
