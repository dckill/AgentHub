import { describe, expect, it, vi } from 'vitest';
import { emitSessionUpdateWithAck } from './sessionUpdateAck';

describe('emitSessionUpdateWithAck', () => {
    it('uses the bounded socket ack and fail-closes transport timeout', async () => {
        const error = new Error('operation has timed out');
        const emitWithAck = vi.fn(async () => { throw error; });
        const timeout = vi.fn(() => ({ emitWithAck }));
        const onError = vi.fn();

        await expect(emitSessionUpdateWithAck({
            socket: { timeout },
            event: 'update-metadata',
            data: { sid: 's1' },
            timeoutMs: 30_000,
            onError,
        })).resolves.toBeNull();

        expect(timeout).toHaveBeenCalledWith(30_000);
        expect(emitWithAck).toHaveBeenCalledWith('update-metadata', { sid: 's1' });
        expect(onError).toHaveBeenCalledWith(error);
    });

    it('returns server ack responses unchanged', async () => {
        const response = { result: 'success', version: 2 };
        const emitWithAck = vi.fn(async () => response);

        await expect(emitSessionUpdateWithAck({
            socket: { timeout: vi.fn(() => ({ emitWithAck })) },
            event: 'update-state',
            data: { sid: 's1' },
            timeoutMs: 30_000,
            onError: vi.fn(),
        })).resolves.toBe(response);
    });
});
