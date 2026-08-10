import { describe, expect, it } from 'vitest';
import { isCompletedThreadTurn } from './turnCompletion';

describe('isCompletedThreadTurn', () => {
    it('uses an explicit status when present', () => {
        expect(isCompletedThreadTurn({ status: 'completed', completedAt: null })).toBe(true);
        expect(isCompletedThreadTurn({ status: 'failed', completedAt: 1 })).toBe(false);
    });

    it('falls back to completedAt for older thread payloads', () => {
        expect(isCompletedThreadTurn({ status: undefined, completedAt: 1 })).toBe(true);
        expect(isCompletedThreadTurn({ status: undefined, completedAt: null })).toBe(false);
    });
});
