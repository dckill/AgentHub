import { describe, expect, it } from 'vitest';
import {
    formatShortcut,
    formatShortcutChord,
    getGlobalShortcutId,
    getPreferredShortcutModifier,
    getRecentSessionShortcutIndex,
    matchesShortcutChord,
    SESSION_ACTION_SHORTCUTS,
    SIDEBAR_PICKER_SHORTCUTS,
} from './shortcuts';

const event = (overrides: Partial<Parameters<typeof getGlobalShortcutId>[0]> = {}) => ({
    key: 'k',
    code: 'KeyK',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
});

describe('keyboard shortcuts', () => {
    it('识别全局快捷键并拒绝输入法、AltGraph 与错误修饰键', () => {
        expect(getGlobalShortcutId(event())).toBe('commandPalette');
        expect(getGlobalShortcutId(event({ key: 'n', code: 'KeyN' }))).toBe('newSession');
        expect(getGlobalShortcutId(event({ key: ',', code: 'Comma' }))).toBe('settings');
        expect(getGlobalShortcutId(event({ isComposing: true }))).toBeNull();
        expect(getGlobalShortcutId(event({ getModifierState: (key) => key === 'AltGraph' }))).toBeNull();
        expect(getGlobalShortcutId(event({ altKey: true }))).toBeNull();
    });

    it('浏览器安全模式要求额外 Alt 修饰键', () => {
        expect(getGlobalShortcutId(event({ altKey: true }), true)).toBe('commandPalette');
        expect(getGlobalShortcutId(event(), true)).toBeNull();
    });

    it('把主修饰键加数字映射到最近会话位置', () => {
        expect(getRecentSessionShortcutIndex(event({ key: '1', code: 'Digit1' }))).toBe(0);
        expect(getRecentSessionShortcutIndex(event({ key: '9', code: 'Numpad9' }))).toBe(8);
        expect(getRecentSessionShortcutIndex(event({ key: '0', code: 'Digit0' }))).toBeNull();
    });

    it('根据平台生成可发现的快捷键标签', () => {
        expect(getPreferredShortcutModifier({ userAgentData: { platform: 'macOS' } })).toBe('meta');
        expect(getPreferredShortcutModifier({ platform: 'Linux x86_64' })).toBe('control');
        expect(formatShortcut('meta', 'N')).toBe('⌘N');
        expect(formatShortcut('control', 'N', true)).toBe('Ctrl+Alt+N');
        expect(formatShortcutChord('meta', SESSION_ACTION_SHORTCUTS['duplicate-session'])).toBe('⌥⇧⌘D');
        expect(formatShortcutChord('control', SIDEBAR_PICKER_SHORTCUTS.newSideChat)).toBe('Ctrl+Alt+S');
    });

    it('会话动作快捷键必须精确匹配修饰键且忽略重复触发', () => {
        expect(matchesShortcutChord(event({ key: 'o', code: 'KeyO', altKey: true }), 'meta', SESSION_ACTION_SHORTCUTS.details)).toBe(true);
        expect(matchesShortcutChord(event({ key: 'o', code: 'KeyO', altKey: false }), 'meta', SESSION_ACTION_SHORTCUTS.details)).toBe(false);
        expect(matchesShortcutChord(event({ key: 'o', code: 'KeyO', altKey: true, repeat: true }), 'meta', SESSION_ACTION_SHORTCUTS.details)).toBe(false);
    });
});
