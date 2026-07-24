import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const { act, create } = require('react-test-renderer') as {
    act: (callback: () => Promise<void> | void) => Promise<void>;
    create: (element: React.ReactElement) => {
        update: (element: React.ReactElement) => void;
        unmount: () => void;
    };
};

const copy: Record<string, string> = {
    'sessionThinking.working': 'Working',
    'sessionThinking.thinking': 'Thinking',
    'sessionThinking.reviewingContext': 'Reviewing context',
    'sessionThinking.checkingChanges': 'Checking changes',
    'sessionThinking.preparingNextStep': 'Preparing the next step',
    'sessionThinking.readingToolOutput': 'Reading tool output',
    'sessionThinking.refiningJudgment': 'Refining the judgment',
    'sessionThinking.composingReply': 'Composing a reply',
    'sessionThinking.calibratingDirection': 'Calibrating the direction',
    'sessionThinking.completingThoughts': 'Completing the thought',
    'sessionThinking.approachingAnswer': 'Getting closer to the answer',
    'sessionThinking.polishingExpression': 'Polishing the response',
    'status.online': 'online',
    'status.permissionRequired': 'permission required',
};

vi.mock('@/text', () => ({
    t: (key: string) => copy[key] ?? key,
}));

import { type SessionStatus, useSessionStatus } from './sessionUtils';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function session(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

describe('useSessionStatus', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('preserves disconnected → permission → thinking → waiting priority', async () => {
        const latest: { current: SessionStatus | null } = { current: null };
        function Harness({ value }: { value: Session }) {
            latest.current = useSessionStatus(value);
            return null;
        }

        let renderer: ReturnType<typeof create> | null = null;
        await act(async () => {
            renderer = create(React.createElement(Harness, {
                value: session({
                    presence: 1,
                    thinking: true,
                    agentState: { requests: { request: {} as any } },
                }),
            }));
        });
        expect(latest.current?.state).toBe('disconnected');

        await act(async () => {
            renderer?.update(React.createElement(Harness, {
                value: session({ thinking: true, agentState: { requests: { request: {} as any } } }),
            }));
        });
        expect(latest.current).toMatchObject({
            state: 'permission_required',
            statusText: 'permission required',
            isPulsing: true,
        });

        await act(async () => {
            renderer?.update(React.createElement(Harness, { value: session({ thinking: true }) }));
        });
        expect(latest.current).toMatchObject({ state: 'thinking', statusText: 'Working…', isPulsing: true });

        await act(async () => {
            renderer?.update(React.createElement(Harness, { value: session() }));
        });
        expect(latest.current).toMatchObject({
            state: 'waiting',
            statusText: 'online',
            shouldShowStatus: false,
        });

        await act(async () => renderer?.unmount());
    });

    it('rotates translated thinking copy on the existing 5.2 second cadence', async () => {
        const latest: { current: SessionStatus | null } = { current: null };
        function Harness() {
            latest.current = useSessionStatus(session({ thinking: true }));
            return null;
        }

        let renderer: ReturnType<typeof create> | null = null;
        await act(async () => {
            renderer = create(React.createElement(Harness));
        });
        expect(latest.current?.statusText).toBe('Working…');

        await act(async () => {
            vi.advanceTimersByTime(5200);
        });
        expect(latest.current?.statusText).toBe('Thinking…');

        await act(async () => renderer?.unmount());
    });
});
