import { describe, expect, it } from 'vitest';

import { buildEphemeralUpdateDispatch } from './ephemeralUpdateDispatch';

describe('buildEphemeralUpdateDispatch', () => {
    it('routes activity updates only to the activity accumulator', () => {
        expect(buildEphemeralUpdateDispatch({
            type: 'activity',
            id: 's1',
            active: true,
            activeAt: 10,
            thinking: false,
        })).toEqual({ activity: true, machineActivity: false, usage: false, sessionControl: false });
    });

    it('routes machine activity, usage, and session control independently', () => {
        expect(buildEphemeralUpdateDispatch({
            type: 'machine-activity',
            id: 'm1',
            active: true,
            activeAt: 10,
        })).toEqual({ activity: false, machineActivity: true, usage: false, sessionControl: false });
        expect(buildEphemeralUpdateDispatch({
            type: 'usage',
            id: 's1',
            key: 'session-1',
            timestamp: 10,
            tokens: { total: 1 },
            cost: { total: 0 },
        })).toEqual({ activity: false, machineActivity: false, usage: true, sessionControl: false });
        expect(buildEphemeralUpdateDispatch({
            type: 'session-control',
            sessionId: 's1',
            activeDeviceId: 'd1',
            activeDeviceAt: 10,
        })).toEqual({ activity: false, machineActivity: false, usage: false, sessionControl: true });
    });
});
