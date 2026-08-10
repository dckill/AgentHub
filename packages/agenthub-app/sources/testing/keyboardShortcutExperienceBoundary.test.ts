import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(sources, path), 'utf8');

describe('keyboard shortcut experience boundary', () => {
    it('全局快捷键覆盖命令面板、新会话、设置和最近会话', () => {
        const hook = read('hooks/useGlobalKeyboard.ts');
        expect(hook).toContain('getRecentSessionShortcutIndex');
        expect(hook).toContain('actionsRef.current.recentSession');
        expect(hook).toContain("window.addEventListener('keydown', handleKeyDown, true)");
    });

    it('命令面板展示平台正确的快捷键并在未认证时禁用导航', () => {
        const provider = read('components/CommandPalette/CommandPaletteProvider.tsx');
        expect(provider).toContain('getPreferredShortcutModifier');
        expect(provider).toContain('browserSafeShortcuts');
        expect(provider).toContain('isAuthenticated');
        expect(provider).toContain('recentSession');
        expect(provider).toContain('ShortcutHintsProvider');
    });

    it('会话动作菜单展示并执行同一份集中式快捷键映射', () => {
        const popover = read('components/SessionActionsPopover.tsx');
        expect(popover).toContain('SESSION_ACTION_SHORTCUTS');
        expect(popover).toContain('matchesShortcutChord');
        expect(popover).toContain('formatShortcutChord');
    });
});
