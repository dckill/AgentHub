import { describe, expect, it } from 'vitest';
import { getSessionLifecycleVisual } from './sessionLifecycleStatus';
import type { Session } from '@/sync/storageTypes';

const session = (lifecycleState?: string) => ({
    id: 'session-1',
    active: false,
    activeAt: 1_000,
    createdAt: 1_000,
    updatedAt: 1_000,
    thinking: false,
    thinkingAt: 1_000,
    presence: 'offline',
    metadata: lifecycleState ? { lifecycleState, path: '/repo', homeDir: '/home/user' } : undefined,
} as unknown as Session);

describe('session lifecycle visual status', () => {
    it.each([
        ['archiveRequested', 'warning', 'sessionInfo.lifecycleStopping'],
        ['exited', 'muted', 'sessionInfo.lifecycleRunnerStopped'],
        ['timeout', 'warning', 'sessionInfo.lifecycleStopTimedOut'],
        ['not-found', 'muted', 'sessionInfo.lifecycleRunnerUnavailable'],
        ['archived', 'success', 'sessionInfo.lifecycleArchived'],
    ] as const)('maps %s to an accessible visual state', (lifecycleState, tone, labelKey) => {
        expect(getSessionLifecycleVisual(session(lifecycleState).metadata?.lifecycleState)).toMatchObject({
            lifecycleState,
            tone,
            labelKey,
            icon: expect.any(String),
            accessible: true,
            accessibilityLiveRegion: 'polite',
        });
    });

    it('does not add a badge for ordinary running sessions', () => {
        expect(getSessionLifecycleVisual(session('running').metadata?.lifecycleState)).toBeNull();
        expect(getSessionLifecycleVisual(session().metadata?.lifecycleState)).toBeNull();
    });
});
