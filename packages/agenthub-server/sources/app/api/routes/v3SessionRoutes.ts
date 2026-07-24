import { buildNewMessageUpdate, eventRouter } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { z } from "zod";
import { type Fastify } from "../types";
import { appendEncryptedSessionMessages } from "@/app/session/messageAppend";
import { MAX_ENCRYPTED_MESSAGE_CHARS, MAX_IDENTIFIER_CHARS } from "../utils/validationLimits";
import { AccountQuotaError } from "../utils/accountQuotas";

const getMessagesQuerySchema = z.object({
    after_seq: z.coerce.number().int().min(0).default(0),
    before_seq: z.coerce.number().int().min(1).optional(),
    direction: z.enum(["forward", "backward"]).default("forward"),
    limit: z.coerce.number().int().min(1).max(500).default(100)
});

const sendMessagesBodySchema = z.object({
    messages: z.array(z.object({
        content: z.string().max(MAX_ENCRYPTED_MESSAGE_CHARS),
        localId: z.string().min(1).max(MAX_IDENTIFIER_CHARS)
    })).min(1).max(100)
});

type SelectedMessage = {
    id: string;
    seq: number;
    content: unknown;
    localId: string | null;
    createdAt: Date;
    updatedAt: Date;
};

function toResponseMessage(message: SelectedMessage) {
    return {
        id: message.id,
        seq: message.seq,
        content: message.content,
        localId: message.localId,
        createdAt: message.createdAt.getTime(),
        updatedAt: message.updatedAt.getTime()
    };
}

function toSendResponseMessage(message: Omit<SelectedMessage, "content">) {
    return {
        id: message.id,
        seq: message.seq,
        localId: message.localId,
        createdAt: message.createdAt.getTime(),
        updatedAt: message.updatedAt.getTime()
    };
}

export function v3SessionRoutes(app: Fastify) {
    app.get('/v3/sessions/:sessionId/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string().max(MAX_IDENTIFIER_CHARS)
            }),
            querystring: getMessagesQuerySchema
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;
        const { after_seq, before_seq, direction, limit } = request.query;

        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                accountId: userId
            },
            select: { id: true }
        });

        if (!session) {
            return reply.code(404).send({ error: 'Session not found' });
        }

        const messages = direction === "backward"
            ? await db.sessionMessage.findMany({
                where: {
                    sessionId,
                    ...(before_seq ? { seq: { lt: before_seq } } : {})
                },
                orderBy: { seq: 'desc' },
                take: limit + 1,
                select: {
                    id: true,
                    seq: true,
                    content: true,
                    localId: true,
                    createdAt: true,
                    updatedAt: true
                }
            })
            : await db.sessionMessage.findMany({
                where: {
                    sessionId,
                    seq: { gt: after_seq }
                },
                orderBy: { seq: 'asc' },
                take: limit + 1,
                select: {
                    id: true,
                    seq: true,
                    content: true,
                    localId: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

        const hasMore = messages.length > limit;
        const page = hasMore ? messages.slice(0, limit) : messages;
        const responsePage = direction === "backward" ? [...page].reverse() : page;

        return reply.send({
            messages: responsePage.map(toResponseMessage),
            hasMore
        });
    });

    app.post('/v3/sessions/:sessionId/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string().max(MAX_IDENTIFIER_CHARS)
            }),
            body: sendMessagesBodySchema
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;
        const { messages } = request.body;

        try {
            const txResult = await appendEncryptedSessionMessages(userId, sessionId, messages);

            for (const message of txResult.createdMessages) {
                if (!message.updateSeq) {
                    continue;
                }
                const updatePayload = buildNewMessageUpdate(message, sessionId, message.updateSeq, randomKeyNaked(12));

                eventRouter.emitUpdate({
                    userId,
                    payload: updatePayload,
                    recipientFilter: { type: 'all-interested-in-session', sessionId }
                });
            }

            return reply.send({
                messages: txResult.responseMessages.map(toSendResponseMessage)
            });
        } catch (error) {
            if (error instanceof Error && error.message === 'Session not found') {
                return reply.code(404).send({ error: 'Session not found' });
            }
            if (error instanceof AccountQuotaError) {
                return reply.code(429).send({ error: 'quota-exceeded', resource: 'messages', limit: error.limit });
            }
            throw error;
        }
    });
}
