import { describe, expect, it, vi } from 'vitest';
import { reportCodexProcessFailure } from './codexProcessFailure';

describe('reportCodexProcessFailure', () => {
    it('rejects pending work, resolves the active turn and reports one current-generation failure', () => {
        const rejectPending = vi.fn();
        const resolvePendingTurn = vi.fn();
        const onFatalError = vi.fn();
        const markReported = vi.fn();
        const process = { pid: 42 };

        const reported = reportCodexProcessFailure({
            currentProcess: process,
            process,
            currentEpoch: 7,
            epoch: 7,
            intentionalDisconnectEpoch: null,
            processFailureReportedEpoch: null,
            error: new Error('process exited'),
            markReported,
            rejectPending: (epoch, error) => rejectPending(epoch, error),
            resolvePendingTurn,
            onFatalError,
        });

        expect(reported).toBe(true);
        expect(markReported).toHaveBeenCalledOnce();
        expect(rejectPending).toHaveBeenCalledOnce();
        expect(resolvePendingTurn).toHaveBeenCalledWith(true, 'backend-failure');
        expect(onFatalError).toHaveBeenCalledOnce();
    });

    it('drops stale, intentional and duplicate failures without side effects', () => {
        const cases = [
            { currentProcess: { pid: 1 }, process: { pid: 2 }, currentEpoch: 3, epoch: 3, intentionalDisconnectEpoch: null, processFailureReportedEpoch: null },
            { currentProcess: { pid: 1 }, process: { pid: 1 }, currentEpoch: 3, epoch: 3, intentionalDisconnectEpoch: 3, processFailureReportedEpoch: null },
            { currentProcess: { pid: 1 }, process: { pid: 1 }, currentEpoch: 3, epoch: 3, intentionalDisconnectEpoch: null, processFailureReportedEpoch: 3 },
        ];

        for (const input of cases) {
            const markReported = vi.fn();
            const rejectPending = vi.fn();
            const resolvePendingTurn = vi.fn();
            const onFatalError = vi.fn();
            expect(reportCodexProcessFailure({
                ...input,
                error: new Error('stale'),
                markReported,
                rejectPending: (epoch, error) => rejectPending(epoch, error),
                resolvePendingTurn,
                onFatalError,
            })).toBe(false);
            expect(markReported).not.toHaveBeenCalled();
            expect(rejectPending).not.toHaveBeenCalled();
            expect(resolvePendingTurn).not.toHaveBeenCalled();
            expect(onFatalError).not.toHaveBeenCalled();
        }
    });

    it('does not let a fatal handler exception escape the process event path', () => {
        const onFatalError = vi.fn(() => { throw new Error('handler failed'); });
        const onFatalErrorFailure = vi.fn();
        const process = { pid: 1 };

        expect(() => reportCodexProcessFailure({
            currentProcess: process,
            process,
            currentEpoch: 3,
            epoch: 3,
            intentionalDisconnectEpoch: null,
            processFailureReportedEpoch: null,
            error: new Error('process exited'),
            markReported: vi.fn(),
            rejectPending: vi.fn(),
            resolvePendingTurn: vi.fn(),
            onFatalError,
            onFatalErrorFailure,
        })).not.toThrow();
        expect(onFatalErrorFailure).toHaveBeenCalledOnce();
    });
});
