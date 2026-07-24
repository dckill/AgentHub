import { eventRouter, buildUpdateAccountUpdate } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { Fastify } from "../types";
import { getPublicUrl } from "@/storage/files";
import { z } from "zod";
import { MAX_ENCRYPTED_STATE_CHARS } from "../utils/validationLimits";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { allocateUserSeq } from "@/storage/seq";
import { log } from "@/utils/log";

type UsageBreakdownAggregate = {
    tokens: Record<string, number>;
    cost: Record<string, number>;
    count: number;
    agent?: string | null;
    model?: string | null;
};

function normalizeUsageAgentValue(value: string | null | undefined): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    const sessionMarker = raw.indexOf('-session');
    if (sessionMarker > 0) {
        return raw.slice(0, sessionMarker);
    }
    return raw || 'unknown';
}

function normalizeUsageAgent(key: string | null | undefined, data: PrismaJson.UsageReportData): string {
    const rawAgent = typeof data.agent === 'string' && data.agent.trim().length > 0
        ? data.agent.trim()
        : typeof key === 'string' && key.endsWith('-session') ? key.slice(0, -'-session'.length) : key;
    return normalizeUsageAgentValue(rawAgent);
}

function normalizeUsageModel(data: PrismaJson.UsageReportData): string | null {
    return typeof data.model === 'string' && data.model.trim().length > 0
        ? data.model.trim()
        : null;
}

function addUsageBreakdown(
    map: Map<string, UsageBreakdownAggregate>,
    key: string,
    data: PrismaJson.UsageReportData,
    meta: Pick<UsageBreakdownAggregate, 'agent' | 'model'> = {}
) {
    if (!map.has(key)) {
        map.set(key, {
            tokens: {},
            cost: {},
            count: 0,
            ...meta
        });
    }

    const aggregate = map.get(key)!;
    aggregate.count++;

    for (const [tokenKey, tokenValue] of Object.entries(data.tokens)) {
        if (typeof tokenValue === 'number') {
            aggregate.tokens[tokenKey] = (aggregate.tokens[tokenKey] || 0) + tokenValue;
        }
    }

    for (const [costKey, costValue] of Object.entries(data.cost)) {
        if (typeof costValue === 'number') {
            aggregate.cost[costKey] = (aggregate.cost[costKey] || 0) + costValue;
        }
    }
}

function serializeUsageBreakdowns(map: Map<string, UsageBreakdownAggregate>) {
    return Object.fromEntries(Array.from(map.entries()).map(([key, value]) => [key, {
        tokens: value.tokens,
        cost: value.cost,
        reportCount: value.count,
        agent: value.agent ?? null,
        model: value.model ?? null,
    }]));
}

export function accountRoutes(app: Fastify) {
    app.get('/v1/account/profile', {
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const userId = request.userId;
        const user = await db.account.findUniqueOrThrow({
            where: { id: userId },
            select: {
                firstName: true,
                lastName: true,
                username: true,
                avatar: true
            }
        });
        return reply.send({
            id: userId,
            timestamp: Date.now(),
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            avatar: user.avatar ? { ...user.avatar, url: getPublicUrl(user.avatar.path) } : null,
            connectedServices: []
        });
    });

    // Get Account Settings API
    app.get('/v1/account/settings', {
        preHandler: app.authenticate,
        schema: {
            response: {
                200: z.object({
                    settings: z.string().nullable(),
                    settingsVersion: z.number()
                }),
                500: z.object({
                    error: z.literal('Failed to get account settings')
                })
            }
        }
    }, async (request, reply) => {
        try {
            const user = await db.account.findUnique({
                where: { id: request.userId },
                select: { settings: true, settingsVersion: true }
            });

            if (!user) {
                return reply.code(500).send({ error: 'Failed to get account settings' });
            }

            return reply.send({
                settings: user.settings,
                settingsVersion: user.settingsVersion
            });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to get account settings' });
        }
    });

    // Update Account Settings API
    app.post('/v1/account/settings', {
        schema: {
            body: z.object({
                settings: z.string().max(MAX_ENCRYPTED_STATE_CHARS).nullable(),
                expectedVersion: z.number().int().min(0)
            }),
            response: {
                200: z.union([z.object({
                    success: z.literal(true),
                    version: z.number()
                }), z.object({
                    success: z.literal(false),
                    error: z.literal('version-mismatch'),
                    currentVersion: z.number(),
                    currentSettings: z.string().nullable()
                })]),
                500: z.object({
                    success: z.literal(false),
                    error: z.literal('Failed to update account settings')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { settings, expectedVersion } = request.body;

        try {
            // Get current user data for version check
            const currentUser = await db.account.findUnique({
                where: { id: userId },
                select: { settings: true, settingsVersion: true }
            });

            if (!currentUser) {
                return reply.code(500).send({
                    success: false,
                    error: 'Failed to update account settings'
                });
            }

            // Check current version
            if (currentUser.settingsVersion !== expectedVersion) {
                return reply.code(200).send({
                    success: false,
                    error: 'version-mismatch',
                    currentVersion: currentUser.settingsVersion,
                    currentSettings: currentUser.settings
                });
            }

            // Update settings with version check
            const { count } = await db.account.updateMany({
                where: {
                    id: userId,
                    settingsVersion: expectedVersion
                },
                data: {
                    settings: settings,
                    settingsVersion: expectedVersion + 1,
                    updatedAt: new Date()
                }
            });

            if (count === 0) {
                // Re-fetch to get current version
                const account = await db.account.findUnique({
                    where: { id: userId }
                });
                return reply.code(200).send({
                    success: false,
                    error: 'version-mismatch',
                    currentVersion: account?.settingsVersion || 0,
                    currentSettings: account?.settings || null
                });
            }

            // Generate update for connected clients
            const updSeq = await allocateUserSeq(userId);
            const settingsUpdate = {
                value: settings,
                version: expectedVersion + 1
            };

            // Send account update to user-scoped connections only
            const updatePayload = buildUpdateAccountUpdate(userId, { settings: settingsUpdate }, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                success: true,
                version: expectedVersion + 1
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to update account settings: ${error}`);
            return reply.code(500).send({
                success: false,
                error: 'Failed to update account settings'
            });
        }
    });

    app.post('/v1/usage/query', {
        schema: {
            body: z.object({
                sessionId: z.string().nullish(),
                startTime: z.number().int().positive().nullish(),
                endTime: z.number().int().positive().nullish(),
                groupBy: z.enum(['15min', 'hour', 'day']).nullish()
            })
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, startTime, endTime, groupBy } = request.body;
        const actualGroupBy = groupBy || 'day';

        try {
            // Build query conditions
            const where: {
                accountId: string;
                sessionId?: string | null;
                updatedAt?: {
                    gte?: Date;
                    lte?: Date;
                };
            } = {
                accountId: userId
            };

            if (sessionId) {
                // Verify session belongs to user
                const session = await db.session.findFirst({
                    where: {
                        id: sessionId,
                        accountId: userId
                    }
                });
                if (!session) {
                    return reply.code(404).send({ error: 'Session not found' });
                }
                where.sessionId = sessionId;
            }

            if (startTime || endTime) {
                where.updatedAt = {};
                if (startTime) {
                    where.updatedAt.gte = new Date(startTime * 1000);
                }
                if (endTime) {
                    where.updatedAt.lte = new Date(endTime * 1000);
                }
            }

            // Fetch usage reports
            const reports = await db.usageReport.findMany({
                where,
                orderBy: {
                    updatedAt: 'desc'
                }
            });

            // Aggregate data by time period
            const aggregated = new Map<string, {
                tokens: Record<string, number>;
                cost: Record<string, number>;
                count: number;
                timestamp: number;
                byAgent: Map<string, UsageBreakdownAggregate>;
                byModel: Map<string, UsageBreakdownAggregate>;
            }>();

            for (const report of reports) {
                const data = report.data as PrismaJson.UsageReportData;
                const date = new Date(report.updatedAt);

                // Calculate timestamp based on groupBy
                let timestamp: number;
                if (actualGroupBy === '15min') {
                    // Round down to a 15-minute bucket
                    const bucketMinute = Math.floor(date.getMinutes() / 15) * 15;
                    const bucketDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), bucketMinute, 0, 0);
                    timestamp = Math.floor(bucketDate.getTime() / 1000);
                } else if (actualGroupBy === 'hour') {
                    // Round down to hour
                    const hourDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), 0, 0, 0);
                    timestamp = Math.floor(hourDate.getTime() / 1000);
                } else {
                    // Round down to day
                    const dayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
                    timestamp = Math.floor(dayDate.getTime() / 1000);
                }

                const key = timestamp.toString();

                if (!aggregated.has(key)) {
                    aggregated.set(key, {
                        tokens: {},
                        cost: {},
                        count: 0,
                        timestamp,
                        byAgent: new Map(),
                        byModel: new Map()
                    });
                }

                const agg = aggregated.get(key)!;
                agg.count++;
                const agent = normalizeUsageAgent(report.key, data);
                const model = normalizeUsageModel(data);
                const modelKey = `${agent}:${model ?? '__unknown_model__'}`;

                // Aggregate tokens
                for (const [tokenKey, tokenValue] of Object.entries(data.tokens)) {
                    if (typeof tokenValue === 'number') {
                        agg.tokens[tokenKey] = (agg.tokens[tokenKey] || 0) + tokenValue;
                    }
                }

                // Aggregate costs
                for (const [costKey, costValue] of Object.entries(data.cost)) {
                    if (typeof costValue === 'number') {
                        agg.cost[costKey] = (agg.cost[costKey] || 0) + costValue;
                    }
                }

                addUsageBreakdown(agg.byAgent, agent, data, { agent });
                addUsageBreakdown(agg.byModel, modelKey, data, { agent, model });
            }

            // Convert to array and sort by timestamp
            const result = Array.from(aggregated.values())
                .map(data => ({
                    timestamp: data.timestamp,
                    tokens: data.tokens,
                    cost: data.cost,
                    reportCount: data.count,
                    byAgent: serializeUsageBreakdowns(data.byAgent),
                    byModel: serializeUsageBreakdowns(data.byModel)
                }))
                .sort((a, b) => a.timestamp - b.timestamp);

            return reply.send({
                usage: result,
                groupBy: actualGroupBy,
                totalReports: reports.length
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to query usage reports: ${error}`);
            return reply.code(500).send({ error: 'Failed to query usage reports' });
        }
    });
}
