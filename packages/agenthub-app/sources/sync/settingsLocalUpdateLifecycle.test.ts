import { describe, expect, it, vi } from 'vitest';
import { applyLocalSettingsUpdate } from './settingsLocalUpdateLifecycle';

type SettingsShape = {
    theme: 'light' | 'dark';
    sendOnEnter: boolean;
};

describe('applyLocalSettingsUpdate', () => {
    it('applies, merges, persists, and invalidates in that order', () => {
        const calls: string[] = [];
        const applyLocal = vi.fn(() => calls.push('apply'));
        const save = vi.fn(() => calls.push('save'));
        const invalidate = vi.fn(() => calls.push('invalidate'));

        const pending = applyLocalSettingsUpdate<SettingsShape>({
            delta: { sendOnEnter: true },
            pendingSettings: { theme: 'dark' },
            applyLocal,
            save,
            invalidate,
        });

        expect(pending).toEqual({ theme: 'dark', sendOnEnter: true });
        expect(calls).toEqual(['apply', 'save', 'invalidate']);
        expect(save).toHaveBeenCalledWith({ theme: 'dark', sendOnEnter: true });
    });

    it('does not persist or invalidate when local application fails', () => {
        const applyLocal = vi.fn(() => { throw new Error('storage unavailable'); });
        const save = vi.fn();
        const invalidate = vi.fn();

        expect(() => applyLocalSettingsUpdate<SettingsShape>({
            delta: { theme: 'light' },
            pendingSettings: {},
            applyLocal,
            save,
            invalidate,
        })).toThrow('storage unavailable');

        expect(save).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('does not mutate the previous pending settings object', () => {
        const pendingSettings = { theme: 'dark' } as Partial<SettingsShape>;
        const save = vi.fn();

        const next = applyLocalSettingsUpdate<SettingsShape>({
            delta: { sendOnEnter: false },
            pendingSettings,
            applyLocal: vi.fn(),
            save,
            invalidate: vi.fn(),
        });

        expect(pendingSettings).toEqual({ theme: 'dark' });
        expect(next).not.toBe(pendingSettings);
    });
});
