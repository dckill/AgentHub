import { describe, expect, it, vi } from 'vitest';
import { runSessionArchiveActionLifecycle } from './sessionArchiveActionLifecycle';

describe('session archive action lifecycle', () => {
    it('stops before the stop request when cleanup makes the account stale', async () => {
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const stop = vi.fn(async () => ({ ok: true }));
        const applyProjection = vi.fn();
        const refresh = vi.fn(async () => undefined);

        const archived = await runSessionArchiveActionLifecycle({
            isCurrent,
            cleanup: vi.fn(async () => undefined),
            stop,
            applyObservation: vi.fn(),
            applyProjection,
            refresh,
            onAfterArchive: vi.fn(),
        });

        expect(archived).toBe(false);
        expect(stop).not.toHaveBeenCalled();
        expect(applyProjection).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('ignores daemon observations and projection after stop becomes stale', async () => {
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const applyObservation = vi.fn();
        const applyProjection = vi.fn();

        const archived = await runSessionArchiveActionLifecycle({
            isCurrent,
            cleanup: vi.fn(async () => undefined),
            stop: vi.fn(async (onDaemonState: (state: string) => void) => {
                onDaemonState('stopping');
                return { ok: true };
            }),
            applyObservation,
            applyProjection,
            refresh: vi.fn(async () => undefined),
            onAfterArchive: vi.fn(),
        });

        expect(archived).toBe(false);
        expect(applyObservation).not.toHaveBeenCalled();
        expect(applyProjection).not.toHaveBeenCalled();
    });

    it('applies projection and completion callback only after a current refresh', async () => {
        const applyProjection = vi.fn();
        const onAfterArchive = vi.fn();

        const archived = await runSessionArchiveActionLifecycle({
            isCurrent: () => true,
            cleanup: vi.fn(async () => undefined),
            stop: vi.fn(async () => ({ ok: true })),
            applyObservation: vi.fn(),
            applyProjection,
            refresh: vi.fn(async () => undefined),
            onAfterArchive,
        });

        expect(archived).toBe(true);
        expect(applyProjection).toHaveBeenCalledWith({ ok: true });
        expect(onAfterArchive).toHaveBeenCalledOnce();
    });

    it('keeps daemon observations while the originating account is current', async () => {
        const applyObservation = vi.fn();

        await runSessionArchiveActionLifecycle({
            isCurrent: () => true,
            cleanup: vi.fn(async () => undefined),
            stop: vi.fn(async (onDaemonState: (state: string) => void) => {
                onDaemonState('stopping');
                return { ok: true };
            }),
            applyObservation,
            applyProjection: vi.fn(),
            refresh: vi.fn(async () => undefined),
            onAfterArchive: vi.fn(),
        });

        expect(applyObservation).toHaveBeenCalledWith('stopping');
    });
});
