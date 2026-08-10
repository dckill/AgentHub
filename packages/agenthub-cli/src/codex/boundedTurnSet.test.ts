import { describe, expect, it } from 'vitest';
import { rememberBoundedTurnId } from './boundedTurnSet';

describe('rememberBoundedTurnId', () => {
    it('evicts the oldest id when the completion window is full', () => {
        const ids = new Set<string>();
        rememberBoundedTurnId(ids, 'turn-1', 2);
        rememberBoundedTurnId(ids, 'turn-2', 2);
        rememberBoundedTurnId(ids, 'turn-3', 2);
        expect([...ids]).toEqual(['turn-2', 'turn-3']);
    });

    it('refreshes duplicate insertion order before applying the bound', () => {
        const ids = new Set<string>();
        rememberBoundedTurnId(ids, 'turn-1', 2);
        rememberBoundedTurnId(ids, 'turn-2', 2);
        rememberBoundedTurnId(ids, 'turn-1', 2);
        rememberBoundedTurnId(ids, 'turn-3', 2);
        expect([...ids]).toEqual(['turn-1', 'turn-3']);
    });
});
