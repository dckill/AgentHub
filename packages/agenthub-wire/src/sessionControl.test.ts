import { describe, expect, it } from 'vitest';
import {
    SessionControlClaimRequestSchema,
    SessionControlEventSchema,
    SessionControlResponseSchema,
} from './sessionControl';

describe('session control wire contract', () => {
    it('accepts a minimal control event without exposing message content', () => {
        const result = SessionControlEventSchema.safeParse({
            type: 'session-control',
            sessionId: 'session-1',
            activeDeviceId: 'device-a',
            activeDeviceAt: 1700000000000,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty('message');
            expect(result.data).not.toHaveProperty('payload');
        }
    });

    it('rejects control requests with an empty identity', () => {
        expect(SessionControlClaimRequestSchema.safeParse({
            sessionId: 'session-1',
            deviceId: '',
        }).success).toBe(false);
    });

    it('models occupied, granted and released responses consistently', () => {
        for (const response of [
            { result: 'granted', sessionId: 'session-1', activeDeviceId: 'device-a', activeDeviceAt: 1 },
            { result: 'occupied', sessionId: 'session-1', activeDeviceId: 'device-b', activeDeviceAt: 2 },
            { result: 'released', sessionId: 'session-1', activeDeviceId: null, activeDeviceAt: null },
        ]) {
            expect(SessionControlResponseSchema.safeParse(response).success).toBe(true);
        }
    });
});
