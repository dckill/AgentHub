import { describe, expect, it, vi } from 'vitest';
import { handleClaudeBackendFailure } from './claudeBackendFailure';

describe('handleClaudeBackendFailure', () => {
    it('requests terminal shutdown for a provider failure when no exit is already pending', async () => {
        const onBackendFatal = vi.fn(async () => undefined);
        const notifyUnexpected = vi.fn();

        await expect(handleClaudeBackendFailure({
            error: new Error('Claude child exited'),
            exitRequested: false,
            onBackendFatal,
            notifyUnexpected,
        })).resolves.toBe('exit');

        expect(onBackendFatal).toHaveBeenCalledWith(expect.objectContaining({ message: 'Claude child exited' }));
        expect(notifyUnexpected).not.toHaveBeenCalled();
    });

    it('keeps the existing exit path when shutdown was already requested', async () => {
        const onBackendFatal = vi.fn(async () => undefined);
        const notifyUnexpected = vi.fn();

        await expect(handleClaudeBackendFailure({
            error: new Error('late provider error'),
            exitRequested: true,
            onBackendFatal,
            notifyUnexpected,
        })).resolves.toBe('exit');

        expect(onBackendFatal).not.toHaveBeenCalled();
        expect(notifyUnexpected).not.toHaveBeenCalled();
    });

    it('retains legacy retry behavior when no fatal handler is supplied', async () => {
        const notifyUnexpected = vi.fn();

        await expect(handleClaudeBackendFailure({
            error: new Error('transient provider error'),
            exitRequested: false,
            notifyUnexpected,
        })).resolves.toBe('retry');

        expect(notifyUnexpected).toHaveBeenCalledTimes(1);
    });

    it('still terminates when the fatal handler itself fails', async () => {
        const onBackendFatal = vi.fn(async () => {
            throw new Error('archive transport failed');
        });
        const notifyUnexpected = vi.fn();

        await expect(handleClaudeBackendFailure({
            error: new Error('Claude child exited'),
            exitRequested: false,
            onBackendFatal,
            notifyUnexpected,
        })).resolves.toBe('exit');

        expect(notifyUnexpected).toHaveBeenCalledTimes(1);
    });
});
