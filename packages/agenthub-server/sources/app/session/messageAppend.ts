import { Prisma } from '@prisma/client';
import { db } from '@/storage/db';
import { allocateSessionSeqBatch, allocateUserSeqBatch } from '@/storage/seq';
import { AccountQuotaError, readAccountQuotas } from '@/app/api/utils/accountQuotas';

const accountQuotas = readAccountQuotas();

export type EncryptedMessageInput = {
    content: string;
    localId?: string | null;
};

type EncryptedSessionMessageContent = {
    t: 'encrypted';
    c: string;
};

export type AppendedMessage = {
    id: string;
    seq: number;
    content: EncryptedSessionMessageContent;
    localId: string | null;
    createdAt: Date;
    updatedAt: Date;
    updateSeq?: number;
};

type AppendMessagesResult = {
    responseMessages: AppendedMessage[];
    createdMessages: AppendedMessage[];
};

function isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toAppendedMessage<T extends { content: unknown }>(message: T): Omit<T, 'content'> & { content: EncryptedSessionMessageContent } {
    return {
        ...message,
        content: message.content as EncryptedSessionMessageContent,
    };
}

function dedupeMessages(messages: EncryptedMessageInput[]) {
    const seenLocalIds = new Set<string>();
    const uniqueMessages: EncryptedMessageInput[] = [];
    for (const message of messages) {
        const localId = typeof message.localId === 'string' && message.localId.length > 0 ? message.localId : null;
        if (localId) {
            if (seenLocalIds.has(localId)) {
                continue;
            }
            seenLocalIds.add(localId);
        }
        uniqueMessages.push({ content: message.content, localId });
    }
    return uniqueMessages;
}

export async function appendEncryptedSessionMessages(userId: string, sessionId: string, messages: EncryptedMessageInput[]): Promise<AppendMessagesResult> {
    const uniqueMessages = dedupeMessages(messages);
    if (uniqueMessages.length === 0) {
        return { responseMessages: [], createdMessages: [] };
    }

    const session = await db.session.findFirst({
        where: { id: sessionId, accountId: userId },
        select: { id: true }
    });
    if (!session) {
        throw new Error('Session not found');
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            return await db.$transaction(async (tx) => {
                const localIds = uniqueMessages
                    .map((message) => message.localId)
                    .filter((localId): localId is string => !!localId);
                const existing = localIds.length > 0
                    ? await tx.sessionMessage.findMany({
                        where: {
                            sessionId,
                            localId: { in: localIds }
                        },
                        select: {
                            id: true,
                            seq: true,
                            content: true,
                            localId: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    })
                    : [];

                const existingByLocalId = new Map<string, AppendedMessage>();
                for (const message of existing) {
                    if (message.localId) {
                        existingByLocalId.set(message.localId, toAppendedMessage(message));
                    }
                }

                const newMessages = uniqueMessages.filter((message) => !message.localId || !existingByLocalId.has(message.localId));
                if (newMessages.length > 0) {
                    const currentMessageCount = await tx.sessionMessage.count({
                        where: { session: { accountId: userId } }
                    });
                    if (currentMessageCount + newMessages.length > accountQuotas.messages) {
                        throw new AccountQuotaError('messages', accountQuotas.messages);
                    }
                }
                const sessionSeqs = await allocateSessionSeqBatch(sessionId, newMessages.length, tx);
                const updateSeqs = await allocateUserSeqBatch(userId, newMessages.length, tx);

                const createdMessages: AppendedMessage[] = [];
                for (let i = 0; i < newMessages.length; i += 1) {
                    const message = newMessages[i];
                    const createdMessage = await tx.sessionMessage.create({
                        data: {
                            sessionId,
                            seq: sessionSeqs[i],
                            content: {
                                t: 'encrypted',
                                c: message.content
                            },
                            localId: message.localId
                        },
                        select: {
                            id: true,
                            seq: true,
                            content: true,
                            localId: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    });
                    await tx.accountSyncEvent.create({
                        data: {
                            accountId: userId,
                            seq: updateSeqs[i],
                            type: 'message-created',
                            payload: {
                                sessionId,
                                messageId: createdMessage.id,
                                sessionSeq: createdMessage.seq
                            }
                        }
                    });
                    createdMessages.push({ ...toAppendedMessage(createdMessage), updateSeq: updateSeqs[i] });
                }

                const responseMessages = [...existing.map(toAppendedMessage), ...createdMessages].sort((a, b) => a.seq - b.seq);
                return { responseMessages, createdMessages };
            });
        } catch (error) {
            if (attempt === 0 && isUniqueConstraintError(error)) {
                continue;
            }
            throw error;
        }
    }

    return { responseMessages: [], createdMessages: [] };
}
