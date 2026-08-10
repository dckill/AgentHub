import { describe, expect, it } from 'vitest';
import { parseApiUpdate } from './updateParser';

describe('parseApiUpdate', () => {
    it('returns the typed update container for a valid payload', () => {
        const parsed = parseApiUpdate({
            id: 'update-1',
            seq: 1,
            createdAt: 100,
            body: { t: 'new-session', id: 'session-1', createdAt: 100, updatedAt: 100 },
        });

        expect(parsed?.body.t).toBe('new-session');
        expect(parsed?.body).toMatchObject({ id: 'session-1' });
    });

    it('returns null for malformed or unknown updates', () => {
        expect(parseApiUpdate(null)).toBeNull();
        expect(parseApiUpdate({ id: 'update-1', seq: 1, createdAt: 100, body: { t: 'unknown' } })).toBeNull();
    });
});
