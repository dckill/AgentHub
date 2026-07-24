import { describe, expect, it } from 'vitest';
import { v4SyncResponseSchema } from './v4Sync';

describe('v4 sync schema', () => {
  it('accepts empty cursor responses for snapshot fallback', () => {
    expect(v4SyncResponseSchema.parse({ cursor: 4, events: [], requiresSnapshot: true })).toEqual({
      cursor: 4,
      events: [],
      requiresSnapshot: true,
    });
  });

  it('accepts durable event-log message events', () => {
    expect(v4SyncResponseSchema.safeParse({
      cursor: 5,
      requiresSnapshot: false,
      events: [{ type: 'message-created', seq: 5, sessionId: 's1', messageId: 'm1', sessionSeq: 2 }],
    }).success).toBe(true);
  });
});
