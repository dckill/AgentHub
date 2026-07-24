import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleMachineOfflineCheck } from './machineDisconnectGrace';

describe('scheduleMachineOfflineCheck', () => {
    afterEach(() => vi.useRealTimers());

    it('does not emit offline while another daemon socket is still connected', async () => {
        vi.useFakeTimers();
        const emitOffline = vi.fn();
        scheduleMachineOfflineCheck({
            hasActiveConnection: vi.fn().mockResolvedValue(true),
            emitOffline,
        });

        await vi.advanceTimersByTimeAsync(1_500);
        expect(emitOffline).not.toHaveBeenCalled();
    });

    it('emits offline after the grace period when no daemon socket remains', async () => {
        vi.useFakeTimers();
        const emitOffline = vi.fn();
        scheduleMachineOfflineCheck({
            hasActiveConnection: vi.fn().mockResolvedValue(false),
            emitOffline,
        });

        await vi.advanceTimersByTimeAsync(1_500);
        expect(emitOffline).toHaveBeenCalledTimes(1);
    });

    it('keeps the last known online state when presence verification fails', async () => {
        vi.useFakeTimers();
        const emitOffline = vi.fn();
        const onCheckError = vi.fn();
        scheduleMachineOfflineCheck({
            hasActiveConnection: vi.fn().mockRejectedValue(new Error('adapter unavailable')),
            emitOffline,
            onCheckError,
        });

        await vi.advanceTimersByTimeAsync(1_500);
        expect(emitOffline).not.toHaveBeenCalled();
        expect(onCheckError).toHaveBeenCalledTimes(1);
    });
});
