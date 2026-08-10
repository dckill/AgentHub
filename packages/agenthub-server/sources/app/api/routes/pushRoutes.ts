import { z } from "zod";
import { type Fastify } from "../types";
import { db } from "@/storage/db";
import { filterPushTargetsForActiveDevice, type PushTarget } from './pushTargeting';
import { eventRouter } from '@/app/events/eventRouter';

export function pushRoutes(app: Fastify) {
    
    // Push Token Registration API
    app.post('/v1/push-tokens', {
        schema: {
            body: z.object({
                token: z.string().trim().min(1).max(4096),
                deviceId: z.string().trim().min(1).max(256).optional(),
            }),
            response: {
                200: z.object({
                    success: z.literal(true)
                }),
                500: z.object({
                    error: z.literal('Failed to register push token')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { token, deviceId } = request.body;

        try {
            await db.accountPushToken.upsert({
                where: {
                    accountId_token: {
                        accountId: userId,
                        token: token
                    }
                },
                update: {
                    updatedAt: new Date(),
                    deviceId: deviceId ?? undefined,
                },
                create: {
                    accountId: userId,
                    token: token,
                    deviceId,
                }
            });

            return reply.send({ success: true });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to register push token' });
        }
    });

    // Delete Push Token API
    app.delete('/v1/push-tokens/:token', {
        schema: {
            params: z.object({
                token: z.string()
            }),
            response: {
                200: z.object({
                    success: z.literal(true)
                }),
                500: z.object({
                    error: z.literal('Failed to delete push token')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { token } = request.params;

        try {
            await db.accountPushToken.deleteMany({
                where: {
                    accountId: userId,
                    token: token
                }
            });

            return reply.send({ success: true });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to delete push token' });
        }
    });

    // Get Push Tokens API
    app.get('/v1/push-tokens', {
        schema: {
            querystring: z.object({ sessionId: z.string().trim().min(1).optional() }),
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;

        try {
            const { sessionId } = request.query;
            const activeSession = sessionId ? await db.session.findFirst({
                where: { id: sessionId, accountId: userId },
                select: { activeDeviceId: true },
            }) : null;
            let activeUiDeviceIds = new Set<string>();
            if (activeSession?.activeDeviceId) {
                try {
                    activeUiDeviceIds = await eventRouter.getActiveUiDeviceIds(userId);
                } catch (error) {
                    // Presence is only an optimization for suppressing the active UI.
                    // If it cannot be proved, keep all targets so notifications fail open.
                    request.log.warn({ error }, 'Unable to verify active UI presence; keeping all push targets');
                }
            }
            const tokens = await db.accountPushToken.findMany({
                where: {
                    accountId: userId,
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            const pushTargets: PushTarget[] = tokens.map(t => ({
                id: t.id,
                    token: t.token,
                    deviceId: t.deviceId,
                    createdAt: t.createdAt.getTime(),
                    updatedAt: t.updatedAt.getTime()
            }));
            return reply.send({
                tokens: filterPushTargetsForActiveDevice(
                    pushTargets,
                    activeSession?.activeDeviceId,
                    activeUiDeviceIds,
                ),
            });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to get push tokens' });
        }
    });
}
