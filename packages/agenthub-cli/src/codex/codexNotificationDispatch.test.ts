import { describe, expect, it, vi } from 'vitest';
import { dispatchCodexNotification } from './codexNotificationDispatch';

describe('dispatchCodexNotification', () => {
    it('writes a notification and reports the method when stdin is writable', () => {
        const stdin = { writable: true, write: vi.fn() };
        const onWrite = vi.fn();

        expect(dispatchCodexNotification({
            stdin,
            method: 'turn/started',
            params: { turnId: 'turn-1' },
            onWrite,
        })).toBe(true);

        expect(stdin.write).toHaveBeenCalledWith(expect.stringContaining('"method":"turn/started"'));
        expect(onWrite).toHaveBeenCalledWith('turn/started');
    });

    it('fails closed without writing when stdin is unavailable', () => {
        const stdin = { writable: false, write: vi.fn() };
        const onWrite = vi.fn();

        expect(dispatchCodexNotification({
            stdin,
            method: 'turn/started',
            onWrite,
        })).toBe(false);

        expect(stdin.write).not.toHaveBeenCalled();
        expect(onWrite).not.toHaveBeenCalled();
    });
});
