import { Fastify } from "../types";
import { z } from "zod";
import { MAX_IDENTIFIER_CHARS, MAX_KV_VALUE_CHARS } from "../utils/validationLimits";
import { db } from "@/storage/db";
import { log } from "@/utils/log";

export function accessKeysRoutes(app: Fastify) {
    // Get Access Key API
    app.get('/v1/access-keys/:sessionId/:machineId', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string().max(MAX_IDENTIFIER_CHARS),
                machineId: z.string().max(MAX_IDENTIFIER_CHARS)
            }),
            response: {
                200: z.object({
                    accessKey: z.object({
                        data: z.string(),
                        dataVersion: z.number(),
                        createdAt: z.number(),
                        updatedAt: z.number()
                    }).nullable()
                }),
                404: z.object({
                    error: z.literal('Session or machine not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get access key')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, machineId } = request.params;

        try {
            // Verify session and machine belong to user
            const [session, machine] = await Promise.all([
                db.session.findFirst({
                    where: { id: sessionId, accountId: userId }
                }),
                db.machine.findFirst({
                    where: { id: machineId, accountId: userId }
                })
            ]);

            if (!session || !machine) {
                return reply.code(404).send({ error: 'Session or machine not found' });
            }

            // Get access key
            const accessKey = await db.accessKey.findUnique({
                where: {
                    accountId_machineId_sessionId: {
                        accountId: userId,
                        machineId,
                        sessionId
                    }
                }
            });

            if (!accessKey) {
                return reply.send({ accessKey: null });
            }

            return reply.send({
                accessKey: {
                    data: accessKey.data,
                    dataVersion: accessKey.dataVersion,
                    createdAt: accessKey.createdAt.getTime(),
                    updatedAt: accessKey.updatedAt.getTime()
                }
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get access key: ${error}`);
            return reply.code(500).send({ error: 'Failed to get access key' });
        }
    });

    // Create Access Key API
    app.post('/v1/access-keys/:sessionId/:machineId', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string().max(MAX_IDENTIFIER_CHARS),
                machineId: z.string().max(MAX_IDENTIFIER_CHARS)
            }),
            body: z.object({
                data: z.string().max(MAX_KV_VALUE_CHARS),
                expectedVersion: z.number().int().min(0).optional()
            }),
            response: {
                200: z.union([
                    z.object({
                        success: z.literal(true),
                        accessKey: z.object({
                            data: z.string(),
                            dataVersion: z.number(),
                            createdAt: z.number(),
                            updatedAt: z.number()
                        }).optional(),
                        version: z.number().optional()
                    }),
                    z.object({
                        success: z.literal(false),
                        error: z.literal('version-mismatch'),
                        currentVersion: z.number(),
                        currentData: z.string()
                    })
                ]),
                404: z.object({
                    error: z.literal('Session or machine not found')
                }),
                409: z.object({
                    error: z.literal('Access key already exists')
                }),
                500: z.object({
                    error: z.string()
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, machineId } = request.params;
        const { data, expectedVersion } = request.body;

        try {
            // Verify session and machine belong to user
            const [session, machine] = await Promise.all([
                db.session.findFirst({
                    where: { id: sessionId, accountId: userId }
                }),
                db.machine.findFirst({
                    where: { id: machineId, accountId: userId }
                })
            ]);

            if (!session || !machine) {
                return reply.code(404).send({ error: 'Session or machine not found' });
            }

            const existing = await db.accessKey.findUnique({
                where: {
                    accountId_machineId_sessionId: {
                        accountId: userId,
                        machineId,
                        sessionId
                    }
                }
            });

            if (expectedVersion === undefined) {
                if (existing) {
                    return reply.code(409).send({ error: 'Access key already exists' });
                }

                const accessKey = await db.accessKey.create({
                    data: {
                        accountId: userId,
                        machineId,
                        sessionId,
                        data,
                        dataVersion: 1
                    }
                });

                log({ module: 'access-keys', userId, sessionId, machineId }, 'Created new access key');

                return reply.send({
                    success: true,
                    accessKey: {
                        data: accessKey.data,
                        dataVersion: accessKey.dataVersion,
                        createdAt: accessKey.createdAt.getTime(),
                        updatedAt: accessKey.updatedAt.getTime()
                    }
                });
            }

            if (!existing) {
                return reply.code(404).send({ error: 'Session or machine not found' });
            }

            if (existing.dataVersion !== expectedVersion) {
                return reply.code(200).send({
                    success: false,
                    error: 'version-mismatch',
                    currentVersion: existing.dataVersion,
                    currentData: existing.data
                });
            }

            const { count } = await db.accessKey.updateMany({
                where: {
                    accountId: userId,
                    machineId,
                    sessionId,
                    dataVersion: expectedVersion
                },
                data: {
                    data,
                    dataVersion: expectedVersion + 1,
                    updatedAt: new Date()
                }
            });

            if (count === 0) {
                const accessKey = await db.accessKey.findUnique({
                    where: {
                        accountId_machineId_sessionId: {
                            accountId: userId,
                            machineId,
                            sessionId
                        }
                    }
                });
                return reply.code(200).send({
                    success: false,
                    error: 'version-mismatch',
                    currentVersion: accessKey?.dataVersion || 0,
                    currentData: accessKey?.data || ''
                });
            }

            log({ module: 'access-keys', userId, sessionId, machineId }, `Updated access key to version ${expectedVersion + 1}`);

            return reply.send({
                success: true,
                version: expectedVersion + 1
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to mutate access key: ${error}`);
            return reply.code(500).send({ error: 'Failed to mutate access key' });
        }
    });
}
