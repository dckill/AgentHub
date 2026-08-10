import {
    SessionControlClaimRequestSchema,
    SessionControlGetRequestSchema,
    SessionControlReleaseRequestSchema,
} from '@artsum/agenthub-wire';
import { Socket } from 'socket.io';
import { eventRouter, buildSessionControlEphemeral } from '@/app/events/eventRouter';
import { claimSessionControl, getSessionControl, releaseSessionControl } from '@/app/session/sessionControl';

function invalidResponse(sessionId = 'invalid') {
    return {
        result: 'invalid' as const,
        sessionId,
        activeDeviceId: null,
        activeDeviceAt: null,
    };
}

export function sessionControlHandler(userId: string, socket: Socket, deviceId?: string) {
    socket.on('session-control-get', async (data: unknown, callback: (response: unknown) => void) => {
        const parsed = SessionControlGetRequestSchema.safeParse(data);
        if (!parsed.success) {
            callback(invalidResponse());
            return;
        }
        const state = await getSessionControl(userId, parsed.data.sessionId);
        callback({
            result: state.result === 'not-found' ? 'not-found' : 'state',
            sessionId: state.sessionId,
            activeDeviceId: state.activeDeviceId,
            activeDeviceAt: state.activeDeviceAt,
        });
    });

    socket.on('session-control-claim', async (data: unknown, callback: (response: unknown) => void) => {
        const parsed = SessionControlClaimRequestSchema.safeParse(data);
        if (!parsed.success || !deviceId || parsed.data.deviceId !== deviceId) {
            callback(invalidResponse(parsed.success ? parsed.data.sessionId : undefined));
            return;
        }
        const response = await claimSessionControl(userId, parsed.data.sessionId, deviceId);
        callback(response);
        if (response.result === 'granted') {
            eventRouter.emitEphemeral({
                userId,
                payload: buildSessionControlEphemeral(response),
                recipientFilter: { type: 'all-interested-in-session', sessionId: response.sessionId },
            });
        }
    });

    socket.on('session-control-release', async (data: unknown, callback: (response: unknown) => void) => {
        const parsed = SessionControlReleaseRequestSchema.safeParse(data);
        if (!parsed.success || !deviceId || parsed.data.deviceId !== deviceId) {
            callback(invalidResponse(parsed.success ? parsed.data.sessionId : undefined));
            return;
        }
        const response = await releaseSessionControl(userId, parsed.data.sessionId, deviceId);
        callback(response);
        if (response.result === 'released') {
            eventRouter.emitEphemeral({
                userId,
                payload: buildSessionControlEphemeral(response),
                recipientFilter: { type: 'all-interested-in-session', sessionId: response.sessionId },
            });
        }
    });
}
