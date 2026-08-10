import { describe, expect, it, vi } from 'vitest';
import { abortCodexTurnWithFallback } from './codexAbortTurnFallback';

describe('abortCodexTurnWithFallback', () => {
    const baseOptions = () => ({
        hasActiveTurn: vi.fn(() => true),
        interrupt: vi.fn(async () => undefined),
        waitForCompletion: vi.fn(async () => true),
        defaultGracePeriodMs: 3000,
        getPendingTurnId: vi.fn(() => 'turn-1'),
        reconnectAndResumeThread: vi.fn(async () => true),
        isRecoveredTurn: vi.fn(() => false),
        emitEvent: vi.fn(),
        onForceRestart: vi.fn(),
    });

    it('returns an idle result without issuing an interrupt', async () => {
        const options = baseOptions();
        options.hasActiveTurn.mockReturnValue(false);

        await expect(abortCodexTurnWithFallback(options)).resolves.toEqual({
            hadActiveTurn: false,
            aborted: false,
            forcedRestart: false,
            resumedThread: false,
        });
        expect(options.interrupt).not.toHaveBeenCalled();
    });

    it('reports a settled interrupt without forcing a restart', async () => {
        const options = baseOptions();

        await expect(abortCodexTurnWithFallback(options)).resolves.toEqual({
            hadActiveTurn: true,
            aborted: true,
            forcedRestart: false,
            resumedThread: false,
        });
        expect(options.interrupt).toHaveBeenCalledOnce();
        expect(options.waitForCompletion).toHaveBeenCalledWith(3000);
        expect(options.reconnectAndResumeThread).not.toHaveBeenCalled();
    });

    it('can leave an unsettled turn pending when force restart is disabled', async () => {
        const options = baseOptions();
        options.waitForCompletion.mockResolvedValue(false);

        await expect(abortCodexTurnWithFallback({
            ...options,
            forceRestartOnTimeout: false,
            gracePeriodMs: 25,
        })).resolves.toEqual({
            hadActiveTurn: true,
            aborted: false,
            forcedRestart: false,
            resumedThread: false,
        });
        expect(options.waitForCompletion).toHaveBeenCalledWith(25);
        expect(options.reconnectAndResumeThread).not.toHaveBeenCalled();
    });

    it('emits forced abort only when recovery did not replay the pending turn', async () => {
        const options = baseOptions();
        options.waitForCompletion.mockResolvedValue(false);

        await expect(abortCodexTurnWithFallback(options)).resolves.toEqual({
            hadActiveTurn: true,
            aborted: true,
            forcedRestart: true,
            resumedThread: true,
        });
        expect(options.onForceRestart).toHaveBeenCalledWith(3000);
        expect(options.emitEvent).toHaveBeenCalledWith({
            type: 'turn_aborted',
            reason: 'interrupted',
            turn_id: 'turn-1',
            forced_restart: true,
        });

        options.isRecoveredTurn.mockReturnValue(true);
        options.emitEvent.mockClear();
        await abortCodexTurnWithFallback(options);
        expect(options.emitEvent).not.toHaveBeenCalled();
    });
});
