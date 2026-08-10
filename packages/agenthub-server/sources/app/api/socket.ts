import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { buildMachineActivityEphemeral, buildSessionControlEphemeral, ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { Redis } from "ioredis";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";
import { db } from "@/storage/db";
import { getMetricsLabelsFromSocket, redisStreamLagMsGauge, websocketConnectionsGauge, websocketEventsCounter } from "../monitoring/metrics2";
import { usageHandler } from "./socket/usageHandler";
import { rpcHandler } from "./socket/rpcHandler";
import { pingHandler } from "./socket/pingHandler";
import { sessionUpdateHandler } from "./socket/sessionUpdateHandler";
import { machineUpdateHandler } from "./socket/machineUpdateHandler";
import { artifactUpdateHandler } from "./socket/artifactUpdateHandler";
import { accessKeyHandler } from "./socket/accessKeyHandler";
import { fileTransferHandler } from "./socket/fileTransferHandler";
import { getAllowedOriginsForLog, resolveCorsOrigin } from "./utils/security";
import { SOCKET_MESSAGE_LIMIT_BYTES } from "./utils/resourceLimits";
import { enableSocketResourceLimits } from "./utils/enableSocketResourceLimits";
import { scheduleMachineOfflineCheck } from "../presence/machineDisconnectGrace";
import { sessionControlHandler } from "./socket/sessionControlHandler";
import { scheduleDisconnectedDeviceControlCleanup } from "@/app/session/sessionControl";
import { validateSocketScope } from "./socket/socketScope";
import { startSocketAuthRevalidation } from "./socket/socketAuthRevalidation";
import { isUserAppState } from '@/app/presence/appStatePresence';

export function startSocket(app: Fastify) {
    log({ module: 'websocket', allowedOrigins: getAllowedOriginsForLog() }, 'Socket.IO CORS policy configured');

    const io = new Server(app.server, {
        cors: {
            origin: resolveCorsOrigin,
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["Authorization", "Content-Type", "X-AgentHub-Client"]
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 45000,
        pingInterval: 15000,
        path: '/v1/updates',
        allowUpgrades: true,
        upgradeTimeout: 10000,
        connectTimeout: 20000,
        maxHttpBufferSize: SOCKET_MESSAGE_LIMIT_BYTES,
        serveClient: false, // Don't serve the client files
        // Brief-disconnect event replay. Currently OFF to preserve parity with
        // pre-multi-process prod behavior — clients fall through to the full
        // REST re-fetch path on every reconnect (apiSocket.ts onReconnected
        // listener). Enabling this lets socket.io replay missed events from
        // the streams adapter (which implements restoreSession via the Redis
        // stream) so the client can skip the heavy refetch when
        // socket.recovered === true. Verified working cross-replica via
        // deploy/integration-tests/missed-events.mjs (event #2 fired during a
        // forced engine.close() arrived after auto-reconnect, recovered=true).
        // Ship parity first; turn this on as a follow-up.
        // connectionStateRecovery: {
        //     maxDisconnectionDuration: 2 * 60 * 1000,
        // },
    });

    // Multi-process support: attach Redis streams adapter when REDIS_URL is set
    if (process.env.REDIS_URL) {
        const streamClient = new Redis(process.env.REDIS_URL);
        io.adapter(createAdapter(streamClient, { maxLen: 200000, readCount: 2000 }));
        log({ module: 'websocket' }, 'Redis streams adapter enabled for multi-process support');

        // Track stream reader lag: wrap onRawMessage to capture last-read offset,
        // then periodically compare against stream HEAD.
        let lastReadOffset = "0-0";
        const adapter = io.of("/").adapter as any;
        const origOnRawMessage = adapter.onRawMessage.bind(adapter);
        adapter.onRawMessage = (msg: any, offset: string) => {
            lastReadOffset = offset;
            return origOnRawMessage(msg, offset);
        };
        const streamLagTimer = setInterval(async () => {
            try {
                const info = await streamClient.xinfo("STREAM", "socket.io") as any[];
                const headId = String(info[info.indexOf("last-generated-id") + 1]);
                const headMs = parseInt(headId.split("-")[0]);
                const readMs = parseInt(lastReadOffset.split("-")[0]);
                redisStreamLagMsGauge.set(headMs - readMs);
            } catch { /* stream may not exist yet */ }
        }, 5000);
        onShutdown('redis-socket', async () => {
            clearInterval(streamLagTimer);
            await streamClient.quit();
        });
    }

    // Initialize event router with Socket.IO server instance
    eventRouter.init(io);

    // Auth runs in middleware so it completes BEFORE the client's `connect`
    // event fires. Without this, the async verifyToken in the connection
    // callback creates a window where client events (rpc-register, rpc-call)
    // arrive before handlers are attached — and get silently dropped.
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token as string;
        const clientType = socket.handshake.auth.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.handshake.auth.sessionId as string | undefined;
        const machineId = socket.handshake.auth.machineId as string | undefined;
        const deviceId = typeof socket.handshake.auth.deviceId === 'string'
            ? socket.handshake.auth.deviceId.trim() || undefined
            : undefined;
        const appState = isUserAppState(socket.handshake.auth.appState)
            ? socket.handshake.auth.appState
            : undefined;

        if (!token) {
            log({ module: 'websocket' }, `No token provided`);
            next(new Error('Missing authentication token'));
            return;
        }

        if (clientType === 'session-scoped' && !sessionId) {
            log({ module: 'websocket' }, `Session-scoped client missing sessionId`);
            next(new Error('Session ID required for session-scoped clients'));
            return;
        }

        if (clientType === 'machine-scoped' && !machineId) {
            log({ module: 'websocket' }, `Machine-scoped client missing machineId`);
            next(new Error('Machine ID required for machine-scoped clients'));
            return;
        }

        const verified = await auth.verifyToken(token);
        if (!verified) {
            log({ module: 'websocket' }, `Invalid token provided`);
            next(new Error('Invalid authentication token'));
            return;
        }

        try {
            const scopeValid = await validateSocketScope({
                db,
                userId: verified.userId,
                clientType,
                sessionId,
                machineId,
            });
            if (!scopeValid) {
                log({ module: 'websocket', userId: verified.userId, clientType, sessionId, machineId }, 'Socket scope does not belong to authenticated account');
                next(new Error('Socket scope is not owned by authenticated account'));
                return;
            }
        } catch (error) {
            log({ module: 'websocket', level: 'error', userId: verified.userId, clientType, sessionId, machineId, error }, 'Failed to validate socket scope');
            next(new Error('Unable to validate socket scope'));
            return;
        }

        socket.data.userId = verified.userId;
        socket.data.clientType = clientType;
        socket.data.sessionId = sessionId;
        socket.data.machineId = machineId;
        socket.data.deviceId = deviceId;
        socket.data.appState = appState;
        socket.data.agenthubClient = socket.handshake.auth.agenthubClient as string
            || socket.handshake.headers['x-agenthub-client'] as string
            || undefined;
        next();
    });

    io.on("connection", (socket) => {
        const userId = socket.data.userId as string;
        const stopTokenAuthRevalidation = startSocketAuthRevalidation({
            token: socket.handshake.auth.token as string,
            verifyToken: (token) => auth.verifyToken(token),
            disconnect: (close) => socket.disconnect(close),
        });
        enableSocketResourceLimits(socket, { subject: userId });
        const clientType = socket.data.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.data.sessionId as string | undefined;
        const machineId = socket.data.machineId as string | undefined;
        const deviceId = socket.data.deviceId as string | undefined;
        const labels = getMetricsLabelsFromSocket(socket);

        log({ module: 'websocket' }, `Token verified: ${userId}, clientType: ${clientType || 'user-scoped'}, client: ${labels.client}, sessionId: ${sessionId || 'none'}, machineId: ${machineId || 'none'}, socketId: ${socket.id}`);

        // Store connection based on type
        const metadata = { clientType: clientType || 'user-scoped', sessionId, machineId };
        let connection: ClientConnection;
        if (metadata.clientType === 'session-scoped' && sessionId) {
            connection = {
                connectionType: 'session-scoped',
                socket,
                userId,
                sessionId,
                deviceId
            };
        } else if (metadata.clientType === 'machine-scoped' && machineId) {
            connection = {
                connectionType: 'machine-scoped',
                socket,
                userId,
                machineId,
                deviceId
            };
        } else {
            connection = {
                connectionType: 'user-scoped',
                socket,
                userId,
                deviceId
            };
        }
        eventRouter.addConnection(userId, connection);
        websocketConnectionsGauge.inc({ type: connection.connectionType, ...labels });

        // Broadcast daemon online status
        if (connection.connectionType === 'machine-scoped') {
            // Broadcast daemon online
            const machineActivity = buildMachineActivityEphemeral(machineId!, true, Date.now());
            eventRouter.emitEphemeral({
                userId,
                payload: machineActivity,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        socket.on('disconnect', () => {
            stopTokenAuthRevalidation();
            websocketEventsCounter.inc({ event_type: 'disconnect', ...labels });

            // Cleanup connections
            eventRouter.removeConnection(userId, connection);
            websocketConnectionsGauge.dec({ type: connection.connectionType, ...labels });

            log({ module: 'websocket' }, `User disconnected: ${userId}`);

            if (connection.connectionType === 'user-scoped' && connection.deviceId) {
                scheduleDisconnectedDeviceControlCleanup({
                    io,
                    accountId: userId,
                    deviceId: connection.deviceId,
                    socketId: socket.id,
                    onReleased: (states) => {
                        for (const state of states) {
                            eventRouter.emitEphemeral({
                                userId,
                                payload: buildSessionControlEphemeral(state),
                                recipientFilter: { type: 'all-interested-in-session', sessionId: state.sessionId },
                            });
                        }
                    },
                });
            }

            // Broadcast daemon offline status
            if (connection.connectionType === 'machine-scoped') {
                const room = `user:${userId}:machine:${connection.machineId}`;
                scheduleMachineOfflineCheck({
                    hasActiveConnection: async () => (await io.in(room).fetchSockets()).length > 0,
                    emitOffline: () => {
                        const machineActivity = buildMachineActivityEphemeral(connection.machineId, false, Date.now());
                        eventRouter.emitEphemeral({
                            userId,
                            payload: machineActivity,
                            recipientFilter: { type: 'user-scoped-only' }
                        });
                    },
                    onCheckError: (error) => {
                        log({ module: 'websocket', machineId: connection.machineId, error }, 'Failed to verify machine offline state; retaining online presence');
                    },
                });
            }
        });

        // Handlers
        rpcHandler(userId, socket, io);
        sessionControlHandler(userId, socket, deviceId);
        fileTransferHandler(userId, socket, io);
        usageHandler(userId, socket);
        sessionUpdateHandler(userId, socket, connection);
        pingHandler(socket);
        machineUpdateHandler(userId, socket);
        artifactUpdateHandler(userId, socket);
        accessKeyHandler(userId, socket);

        // Ready
        log({ module: 'websocket' }, `User connected: ${userId}`);
    });

    onShutdown('api', async () => {
        await io.close();
    });
}
