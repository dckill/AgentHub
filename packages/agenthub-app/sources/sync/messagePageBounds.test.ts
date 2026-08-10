import { describe, expect, it } from 'vitest';
import { getMessagePageBounds } from './messagePageBounds';

describe('getMessagePageBounds', () => {
    it('returns null bounds for an empty page', () => {
        expect(getMessagePageBounds([])).toEqual({ minSeq: null, maxSeq: null });
    });

    it('finds bounds independent of message order', () => {
        expect(getMessagePageBounds([{ seq: 42 }, { seq: 7 }, { seq: 19 }])).toEqual({
            minSeq: 7,
            maxSeq: 42,
        });
    });
});
