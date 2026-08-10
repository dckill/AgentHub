import { beforeEach, describe, expect, it, vi } from 'vitest';

const { eventRouter, claimSessionControl, getSessionControl, releaseSessionControl } = vi.hoisted(() => ({
    eventRouter: { emitEphemeral: vi.fn() },
    claimSessionControl: vi.fn(),
    getSessionControl: vi.fn(),
    releaseSessionControl: vi.fn(),
}));

vi.mock('@/app/events/eventRouter', () => ({
    eventRouter,
    buildSessionControlEphemeral: (state: any) => ({
        type: 'session-control',
        sessionId: state.sessionId,
        activeDeviceId: state.activeDeviceId,
        activeDeviceAt: state.activeDeviceAt,
    }),
}));
vi.mock('@/app/session/sessionControl', () => ({
    claimSessionControl,
    getSessionControl,
    releaseSessionControl,
}));

import { SessionControlResponseSchema } from '@artsum/agenthub-wire';
import { sessionControlHandler } from './sessionControlHandler';

describe('session control socket handler', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns a schema-valid invalid response for malformed input', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        sessionControlHandler('u1', socket as any, 'device-a');

        const callback = vi.fn();
        await handlers['session-control-claim']({ sessionId: '' }, callback);

        expect(SessionControlResponseSchema.parse(callback.mock.calls[0][0])).toMatchObject({ result: 'invalid' });
    });

    it('does not accept a claim for a different handshake device', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        sessionControlHandler('u1', socket as any, 'device-a');

        const callback = vi.fn();
        await handlers['session-control-claim']({ sessionId: 's1', deviceId: 'device-b' }, callback);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ result: 'invalid' }));
        expect(claimSessionControl).not.toHaveBeenCalled();
    });

    it('broadcasts a schema-valid session control event to session observers after a successful claim', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        sessionControlHandler('u1', socket as any, 'device-a');
        claimSessionControl.mockResolvedValue({
            result: 'granted',
            sessionId: 's1',
            activeDeviceId: 'device-a',
            activeDeviceAt: 123,
        });

        const callback = vi.fn();
        await handlers['session-control-claim']({ sessionId: 's1', deviceId: 'device-a' }, callback);

        expect(SessionControlResponseSchema.parse(callback.mock.calls[0][0])).toMatchObject({
            result: 'granted',
            sessionId: 's1',
            activeDeviceId: 'device-a',
        });
        expect(eventRouter.emitEphemeral).toHaveBeenCalledWith({
            userId: 'u1',
            payload: {
                type: 'session-control',
                sessionId: 's1',
                activeDeviceId: 'device-a',
                activeDeviceAt: 123,
            },
            recipientFilter: { type: 'all-interested-in-session', sessionId: 's1' },
        });
    });
});
