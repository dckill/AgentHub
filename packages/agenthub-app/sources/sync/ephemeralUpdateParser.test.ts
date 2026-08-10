import { describe, expect, it } from 'vitest';
import { parseEphemeralUpdate } from './ephemeralUpdateParser';

describe('parseEphemeralUpdate', () => {
    it('returns a typed activity update for a valid payload', () => {
        expect(parseEphemeralUpdate({
            type: 'activity',
            id: 'session-1',
            active: true,
            activeAt: 100,
            thinking: true,
        })).toEqual({
            type: 'activity',
            id: 'session-1',
            active: true,
            activeAt: 100,
            thinking: true,
        });
    });

    it('returns null for malformed or unknown ephemeral updates', () => {
        expect(parseEphemeralUpdate(null)).toBeNull();
        expect(parseEphemeralUpdate({ type: 'activity', id: 'session-1', active: true })).toBeNull();
        expect(parseEphemeralUpdate({ type: 'unknown', id: 'session-1' })).toBeNull();
    });
});
