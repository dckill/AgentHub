import { db } from '@/storage/db';
import type { SessionControlResponse, SessionControlState } from '@artsum/agenthub-wire';
import type { Server } from 'socket.io';

type SessionRow = {
    id: string;
    activeDeviceId: string | null;
    activeDeviceAt: Date | null;
};

function toState(session: SessionRow): SessionControlState {
    return {
        sessionId: session.id,
        activeDeviceId: session.activeDeviceId,
        activeDeviceAt: session.activeDeviceAt?.getTime() ?? null,
    };
}

function result(result: SessionControlResponse['result'], state: SessionControlState): SessionControlResponse {
    return { ...state, result };
}

export async function getSessionControl(accountId: string, sessionId: string): Promise<SessionControlState & { result?: 'state' | 'not-found' }> {
    const session = await db.session.findFirst({
        where: { id: sessionId, accountId },
        select: { id: true, activeDeviceId: true, activeDeviceAt: true },
    }) as SessionRow | null;
    if (!session) {
        return { sessionId, activeDeviceId: null, activeDeviceAt: null, result: 'not-found' };
    }
    return { ...toState(session), result: 'state' };
}

export async function claimSessionControl(
    accountId: string,
    sessionId: string,
    deviceId: string,
    now = Date.now(),
): Promise<SessionControlResponse> {
    const session = await db.session.findFirst({
        where: { id: sessionId, accountId },
        select: { id: true, activeDeviceId: true, activeDeviceAt: true },
    }) as SessionRow | null;
    if (!session) {
        return result('not-found', { sessionId, activeDeviceId: null, activeDeviceAt: null });
    }

    if (session.activeDeviceId && session.activeDeviceId !== deviceId) {
        return result('occupied', toState(session));
    }

    const activeDeviceAt = new Date(now);
    const updated = await db.session.updateMany({
        where: {
            id: sessionId,
            accountId,
            OR: [
                { activeDeviceId: null },
                { activeDeviceId: deviceId },
            ],
        },
        data: { activeDeviceId: deviceId, activeDeviceAt },
    });

    if (updated.count === 0) {
        const latest = await getSessionControl(accountId, sessionId);
        return result(latest.result === 'not-found' ? 'not-found' : 'occupied', latest);
    }

    return result('granted', { sessionId, activeDeviceId: deviceId, activeDeviceAt: now });
}

export async function releaseSessionControl(
    accountId: string,
    sessionId: string,
    deviceId: string,
    now = Date.now(),
): Promise<SessionControlResponse> {
    const session = await db.session.findFirst({
        where: { id: sessionId, accountId },
        select: { id: true, activeDeviceId: true, activeDeviceAt: true },
    }) as SessionRow | null;
    if (!session) {
        return result('not-found', { sessionId, activeDeviceId: null, activeDeviceAt: null });
    }
    if (session.activeDeviceId !== deviceId) {
        return result('occupied', toState(session));
    }

    const updated = await db.session.updateMany({
        where: { id: sessionId, accountId, activeDeviceId: deviceId },
        data: { activeDeviceId: null, activeDeviceAt: new Date(now) },
    });
    if (updated.count === 0) {
        const latest = await getSessionControl(accountId, sessionId);
        return result(latest.result === 'not-found' ? 'not-found' : 'occupied', latest);
    }
    return result('released', { sessionId, activeDeviceId: null, activeDeviceAt: now });
}

export async function canControlSession(
    accountId: string,
    sessionId: string,
    deviceId: string | undefined,
): Promise<boolean> {
    const state = await getSessionControl(accountId, sessionId);
    return state.result !== 'not-found' && (!state.activeDeviceId || state.activeDeviceId === deviceId);
}

export type DisconnectedSessionControlState = SessionControlState;

/**
 * Release controls after a user-scoped device has really disappeared.
 * A short grace window is applied by scheduleDisconnectedDeviceControlCleanup
 * so a Socket.IO reconnect does not cause a needless ownership flicker.
 */
export async function releaseDisconnectedDeviceControl(params: {
    io: Pick<Server, 'in'>;
    accountId: string;
    deviceId: string;
    socketId?: string;
    now?: number;
}): Promise<DisconnectedSessionControlState[]> {
    const room = `user:${params.accountId}:user-scoped`;
    const sockets = await params.io.in(room).fetchSockets();
    const hasReplacementConnection = sockets.some((socket) => (
        socket.id !== params.socketId
        && socket.data?.clientType === 'user-scoped'
        && socket.data?.deviceId === params.deviceId
    ));
    if (hasReplacementConnection) {
        return [];
    }

    const candidates = await db.session.findMany({
        where: { accountId: params.accountId, activeDeviceId: params.deviceId },
        select: { id: true },
    });
    if (candidates.length === 0) {
        return [];
    }

    const releasedAt = params.now ?? Date.now();
    await db.session.updateMany({
        where: { accountId: params.accountId, activeDeviceId: params.deviceId },
        data: { activeDeviceId: null, activeDeviceAt: new Date(releasedAt) },
    });

    const states = await db.session.findMany({
        where: { id: { in: candidates.map((candidate) => candidate.id) }, accountId: params.accountId },
        select: { id: true, activeDeviceId: true, activeDeviceAt: true },
    }) as SessionRow[];
    return states.map(toState);
}

export function scheduleDisconnectedDeviceControlCleanup(params: {
    io: Pick<Server, 'in'>;
    accountId: string;
    deviceId: string;
    socketId?: string;
    graceMs?: number;
    now?: () => number;
    onReleased?: (states: DisconnectedSessionControlState[]) => void;
}): NodeJS.Timeout {
    const timer = setTimeout(() => {
        void releaseDisconnectedDeviceControl({
            io: params.io,
            accountId: params.accountId,
            deviceId: params.deviceId,
            socketId: params.socketId,
            now: params.now?.(),
        }).then((states) => {
            params.onReleased?.(states);
        }).catch((error) => {
            console.warn('[session-control] Failed to release disconnected device control:', error);
        });
    }, params.graceMs ?? 5000);
    timer.unref?.();
    return timer;
}
