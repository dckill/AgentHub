import { describe, expect, it } from 'vitest';

import { shouldResolvePendingTurn } from './pendingTurnResolution.js';

describe('shouldResolvePendingTurn', () => {
    it('accepts matching turn ids and fast-turn notifications without an id', () => {
        expect(shouldResolvePendingTurn({ pendingTurnId: 'turn-1', notificationTurnId: 'turn-1' })).toBe(true);
        expect(shouldResolvePendingTurn({ pendingTurnId: 'turn-1', notificationTurnId: null })).toBe(true);
        expect(shouldResolvePendingTurn({ pendingTurnId: null, notificationTurnId: 'turn-1' })).toBe(true);
    });

    it('rejects a stale notification from a different turn', () => {
        expect(shouldResolvePendingTurn({ pendingTurnId: 'turn-2', notificationTurnId: 'turn-1' })).toBe(false);
    });
});
