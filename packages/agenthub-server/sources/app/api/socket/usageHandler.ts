import { Socket } from "socket.io";
import { AsyncLock } from "@/utils/lock";
import { db } from "@/storage/db";
import { buildUsageEphemeral, eventRouter } from "@/app/events/eventRouter";
import { log } from "@/utils/log";

export function usageHandler(userId: string, socket: Socket) {
    const receiveUsageLock = new AsyncLock();
    socket.on('usage-report', async (data: any, callback?: (response: any) => void) => {
        await receiveUsageLock.inLock(async () => {
            try {
                const { key, sessionId, tokens, cost, model } = data;

                // Validate required fields
                if (!key || typeof key !== 'string') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid key' });
                    }
                    return;
                }

                // Validate tokens and cost objects
                if (!tokens || typeof tokens !== 'object' || typeof tokens.total !== 'number') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid tokens object - must include total' });
                    }
                    return;
                }

                if (!cost || typeof cost !== 'object' || typeof cost.total !== 'number') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid cost object - must include total' });
                    }
                    return;
                }

                if (model != null && typeof model !== 'string') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid model' });
                    }
                    return;
                }

                // Validate sessionId if provided
                if (sessionId && typeof sessionId !== 'string') {
                    if (callback) {
                        callback({ success: false, error: 'Invalid sessionId' });
                    }
                    return;
                }

                try {
                    // If sessionId provided, verify it belongs to the user
                    if (sessionId) {
                        const session = await db.session.findFirst({
                            where: {
                                id: sessionId,
                                accountId: userId
                            }
                        });

                        if (!session) {
                            if (callback) {
                                callback({ success: false, error: 'Session not found' });
                            }
                            return;
                        }
                    }

                    // Prepare usage data
                    const sessionMarker = key.indexOf('-session');
                    const agent = sessionMarker > 0 ? key.slice(0, sessionMarker) : key;
                    const normalizedModel = typeof model === 'string' && model.trim().length > 0
                        ? model.trim()
                        : null;
                    const usageData: PrismaJson.UsageReportData = {
                        agent,
                        model: normalizedModel,
                        tokens,
                        cost
                    };
                    const scopeKey = sessionId ? `session:${sessionId}` : 'account';

                    // Upsert the usage report
                    const report = await db.usageReport.upsert({
                        where: {
                            accountId_scopeKey_key: {
                                accountId: userId,
                                scopeKey,
                                key
                            }
                        },
                        update: {
                            data: usageData,
                            updatedAt: new Date()
                        },
                        create: {
                            accountId: userId,
                            sessionId: sessionId || null,
                            scopeKey,
                            key,
                            data: usageData
                        }
                    });

                    log({ module: 'websocket' }, `Usage report saved: key=${key}, sessionId=${sessionId || 'none'}, userId=${userId}`);

                    // Emit usage ephemeral update if sessionId is provided
                    if (sessionId) {
                        const usageEvent = buildUsageEphemeral(sessionId, key, usageData.tokens, usageData.cost);
                        eventRouter.emitEphemeral({
                            userId,
                            payload: usageEvent,
                            recipientFilter: { type: 'user-scoped-only' }
                        });
                    }

                    if (callback) {
                        callback({
                            success: true,
                            reportId: report.id,
                            createdAt: report.createdAt.getTime(),
                            updatedAt: report.updatedAt.getTime()
                        });
                    }
                } catch (error) {
                    log({ module: 'websocket', level: 'error' }, `Failed to save usage report: ${error}`);
                    if (callback) {
                        callback({ success: false, error: 'Failed to save usage report' });
                    }
                }
            } catch (error) {
                log({ module: 'websocket', level: 'error' }, `Error in usage-report handler: ${error}`);
                if (callback) {
                    callback({ success: false, error: 'Internal error' });
                }
            }
        });
    });
}
