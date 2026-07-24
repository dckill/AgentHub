import { describe, expect, it } from 'vitest';
import { UserMessageSchema } from './types';

describe('UserMessageSchema message metadata', () => {
  it('keeps user messages with forward-compatible permission mode keys routable', () => {
    const parsed = UserMessageSchema.parse({
      role: 'user',
      content: {
        type: 'text',
        text: 'continue',
      },
      meta: {
        permissionMode: 'team-custom-mode',
        model: 'custom-model',
      },
    });

    expect(parsed.meta?.permissionMode).toBe('team-custom-mode');
    expect(parsed.meta?.model).toBe('custom-model');
  });
});
