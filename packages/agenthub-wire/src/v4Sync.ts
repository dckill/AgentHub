import * as z from 'zod';

export const v4SyncEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session-updated'),
    seq: z.number().int().min(1),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal('session-deleted'),
    seq: z.number().int().min(1),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal('message-created'),
    seq: z.number().int().min(1),
    sessionId: z.string(),
    messageId: z.string(),
    sessionSeq: z.number().int().min(1),
  }),
]);

export type V4SyncEvent = z.infer<typeof v4SyncEventSchema>;

export const v4SyncResponseSchema = z.object({
  cursor: z.number().int().min(0),
  events: z.array(v4SyncEventSchema),
  requiresSnapshot: z.boolean(),
});

export type V4SyncResponse = z.infer<typeof v4SyncResponseSchema>;
