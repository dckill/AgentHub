import { describe, expect, it, vi } from 'vitest';
import { routeCodexNotification } from './codexNotificationRouter';

describe('routeCodexNotification', () => {
    it('stops after legacy handling and marks the protocol legacy', () => {
        const raw = vi.fn(() => true);
        const lifecycle = vi.fn(() => true);
        const setProtocol = vi.fn();

        expect(routeCodexNotification({
            method: 'codex/event',
            params: {},
            handleLegacy: () => true,
            handleRaw: raw,
            handleLifecycle: lifecycle,
            setLegacyProtocol: setProtocol,
            logRaw: vi.fn(),
        })).toBe('legacy');
        expect(setProtocol).toHaveBeenCalledOnce();
        expect(raw).not.toHaveBeenCalled();
        expect(lifecycle).not.toHaveBeenCalled();
    });

    it('stops after raw handling and logs the raw method', () => {
        const logRaw = vi.fn();
        const lifecycle = vi.fn();

        expect(routeCodexNotification({
            method: 'turn/started',
            params: {},
            handleLegacy: () => false,
            handleRaw: () => true,
            handleLifecycle: lifecycle,
            setLegacyProtocol: vi.fn(),
            logRaw,
        })).toBe('raw');
        expect(logRaw).toHaveBeenCalledWith('turn/started');
        expect(lifecycle).not.toHaveBeenCalled();
    });

    it('falls through to lifecycle handling when legacy and raw decline', () => {
        const lifecycle = vi.fn(() => true);
        expect(routeCodexNotification({
            method: 'thread/started',
            params: {},
            handleLegacy: () => false,
            handleRaw: () => false,
            handleLifecycle: lifecycle,
            setLegacyProtocol: vi.fn(),
            logRaw: vi.fn(),
        })).toBe('lifecycle');
        expect(lifecycle).toHaveBeenCalledOnce();
    });
});
