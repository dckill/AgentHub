import { describe, expect, it, vi } from 'vitest';
import { applyActivityFlush } from './activityFlushApplication';

describe('applyActivityFlush', () => {
    it('does not write an empty activity batch', () => {
        const applySessions = vi.fn();

        const count = applyActivityFlush({
            updates: new Map(),
            sessions: {},
            applySessions,
        });

        expect(count).toBe(0);
        expect(applySessions).not.toHaveBeenCalled();
    });

    it('applies only projected sessions returned from the activity batch', () => {
        const applySessions = vi.fn();
        const session = {
            id: 'session-1',
            seq: 1,
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            active: false,
            activeAt: 1,
            presence: 0,
            thinking: false,
            thinkingAt: 1,
            createdAt: 1,
            updatedAt: 1,
        };

        const count = applyActivityFlush({
            updates: new Map([
                ['session-1', { id: 'session-1', type: 'activity', active: true, activeAt: 10, thinking: true }],
                ['missing', { id: 'missing', type: 'activity', active: true, activeAt: 10, thinking: true }],
            ]),
            sessions: { 'session-1': session },
            applySessions,
        });

        expect(count).toBe(1);
        expect(applySessions).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'session-1', active: true, activeAt: 10 }),
        ]);
    });
});
