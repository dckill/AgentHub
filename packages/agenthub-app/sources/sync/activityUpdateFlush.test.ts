import { describe, expect, it } from 'vitest';
import { buildActivitySessionUpdates } from './activityUpdateFlush';
import type { Session } from './storageTypes';

function session(id: string): Session {
    return {
        id,
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
}

describe('buildActivitySessionUpdates', () => {
    it('updates only sessions present in the activity batch', () => {
        const result = buildActivitySessionUpdates(
            new Map([
                ['s1', { id: 's1', type: 'activity', active: true, activeAt: 10, thinking: true }],
                ['missing', { id: 'missing', type: 'activity', active: true, activeAt: 10, thinking: true }],
            ]),
            { s1: session('s1') },
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: 's1', active: true, activeAt: 10 });
    });
});
