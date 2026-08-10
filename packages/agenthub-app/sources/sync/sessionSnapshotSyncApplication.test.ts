import { describe, expect, it, vi } from 'vitest';
import { applySessionSnapshotSync } from './sessionSnapshotSyncApplication';
import type { SessionSnapshotApplicationResult } from './sessionSnapshotApplication';
import type { Session } from './storageTypes';

const session = (id: string): Session => ({ id } as Session);

const snapshot = (overrides: Partial<SessionSnapshotApplicationResult> = {}): SessionSnapshotApplicationResult => ({
    reconciledSessions: [session('session-1')],
    shouldRetry: true,
    ignoredEmptySnapshot: false,
    ...overrides,
});

describe('applySessionSnapshotSync', () => {
    it('applies the reconciled sessions and retries when decryption missed records', () => {
        const applySessions = vi.fn();
        const scheduleRetry = vi.fn();

        const applied = applySessionSnapshotSync({
            snapshot: snapshot(),
            applySessions,
            scheduleRetry,
            onIgnoredEmptySnapshot: vi.fn(),
        });

        expect(applySessions).toHaveBeenCalledWith([session('session-1')], true);
        expect(scheduleRetry).toHaveBeenCalledOnce();
        expect(applied).toEqual(snapshot());
    });

    it('keeps an empty authoritative response from deleting existing sessions', () => {
        const onIgnoredEmptySnapshot = vi.fn();
        const applySessions = vi.fn();
        const emptySnapshot = snapshot({
            reconciledSessions: [session('existing')],
            shouldRetry: false,
            ignoredEmptySnapshot: true,
        });

        applySessionSnapshotSync({
            snapshot: emptySnapshot,
            applySessions,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot,
        });

        expect(onIgnoredEmptySnapshot).toHaveBeenCalledOnce();
        expect(applySessions).toHaveBeenCalledWith([session('existing')], true);
    });

    it('does not schedule retry for a clean snapshot', () => {
        const scheduleRetry = vi.fn();

        applySessionSnapshotSync({
            snapshot: snapshot({ shouldRetry: false }),
            applySessions: vi.fn(),
            scheduleRetry,
            onIgnoredEmptySnapshot: vi.fn(),
        });

        expect(scheduleRetry).not.toHaveBeenCalled();
    });
});
