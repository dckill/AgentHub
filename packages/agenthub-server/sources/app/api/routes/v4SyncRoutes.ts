import { db } from '@/storage/db';
import { z } from 'zod';
import { v4SyncResponseSchema, type V4SyncEvent } from '@artsum/agenthub-wire';
import { type Fastify } from '../types';

const syncQuerySchema = z.object({
    after_seq: z.coerce.number().int().min(0).default(0),
});

function toV4SyncEvent(row: { seq: number; type: string; payload: unknown }): V4SyncEvent | null {
    if (row.type === 'message-created' && row.payload && typeof row.payload === 'object') {
        const payload = row.payload as { sessionId?: unknown; messageId?: unknown; sessionSeq?: unknown };
        if (typeof payload.sessionId === 'string' && typeof payload.messageId === 'string' && typeof payload.sessionSeq === 'number' && Number.isInteger(payload.sessionSeq)) {
            return {
                type: 'message-created',
                seq: row.seq,
                sessionId: payload.sessionId,
                messageId: payload.messageId,
                sessionSeq: payload.sessionSeq,
            };
        }
    }
    return null;
}

export function v4SyncRoutes(app: Fastify) {
    app.get('/v4/sync', {
        preHandler: app.authenticate,
        schema: {
            querystring: syncQuerySchema,
            response: {
                200: v4SyncResponseSchema,
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { after_seq } = request.query;

        const [account, rows] = await Promise.all([
            db.account.findUnique({
                where: { id: userId },
                select: { seq: true },
            }),
            db.accountSyncEvent.findMany({
                where: {
                    accountId: userId,
                    seq: { gt: after_seq },
                },
                orderBy: { seq: 'asc' },
                take: 500,
                select: {
                    seq: true,
                    type: true,
                    payload: true,
                },
            }),
        ]);

        const cursor = account?.seq ?? 0;
        const events = rows.map(toV4SyncEvent).filter((event): event is V4SyncEvent => !!event);
        const expectedEventCount = Math.max(0, cursor - after_seq);
        const hasAllEvents = events.length === expectedEventCount && events.every((event, index) => event.seq === after_seq + index + 1);
        const requiresSnapshot = after_seq < cursor && !hasAllEvents;

        return reply.send({
            cursor,
            events: requiresSnapshot ? [] : events,
            requiresSnapshot,
        });
    });
}
