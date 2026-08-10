import {
    SessionControlClaimRequestSchema,
    SessionControlEventSchema,
    SessionControlGetRequestSchema,
    SessionControlResponseSchema,
    SessionControlReleaseRequestSchema,
    type SessionControlResponse,
} from '@artsum/agenthub-wire';
import { apiSocket } from './apiSocket';
import { getOrCreateDeviceId } from './deviceIdentity';

function parseResponse(value: unknown): SessionControlResponse {
    const parsed = SessionControlResponseSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error('Invalid session control response');
    }
    return parsed.data;
}

export async function getSessionControl(sessionId: string): Promise<SessionControlResponse> {
    const request = SessionControlGetRequestSchema.parse({ sessionId });
    return parseResponse(await apiSocket.emitWithAck('session-control-get', request));
}

export async function claimSessionControl(sessionId: string): Promise<SessionControlResponse> {
    const request = SessionControlClaimRequestSchema.parse({ sessionId, deviceId: getOrCreateDeviceId() });
    return parseResponse(await apiSocket.emitWithAck('session-control-claim', request));
}

export async function releaseSessionControl(sessionId: string): Promise<SessionControlResponse> {
    const request = SessionControlReleaseRequestSchema.parse({ sessionId, deviceId: getOrCreateDeviceId() });
    return parseResponse(await apiSocket.emitWithAck('session-control-release', request));
}

export function parseSessionControlEvent(value: unknown) {
    const parsed = SessionControlEventSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
