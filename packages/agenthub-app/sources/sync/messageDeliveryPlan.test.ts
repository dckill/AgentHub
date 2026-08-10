import { describe, expect, it } from 'vitest';
import { getMessageDeliveryPlan } from './messageDeliveryPlan';

describe('getMessageDeliveryPlan', () => {
    it('uses the fast path for the next consecutive sequence', () => {
        expect(getMessageDeliveryPlan(9, 10)).toBe('enqueue');
    });

    it('refreshes when the sequence has a gap or no local cursor', () => {
        expect(getMessageDeliveryPlan(9, 11)).toBe('refresh');
        expect(getMessageDeliveryPlan(undefined, 1)).toBe('refresh');
    });
});
