import { describe, expect, it } from 'vitest';
import { RawJSONLinesSchema } from './types';

const syntheticRateLimitMessage = {
  parentUuid: '71437693-a340-47e8-a0a9-0923839462b5',
  isSidechain: false,
  type: 'assistant',
  uuid: 'e024081f-07a2-43db-93c0-6a9c45690060',
  timestamp: '2026-07-21T23:52:28.148Z',
  message: {
    id: 'a158ca6c-b9cb-44fa-92d2-8233fae10474',
    model: '<synthetic>',
    role: 'assistant',
    type: 'message',
    stop_reason: 'stop_sequence',
    content: [{ type: 'text', text: "You've hit your limit" }],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      service_tier: null,
    },
  },
  error: 'rate_limit',
  isApiErrorMessage: true,
  apiErrorStatus: 429,
};

describe('RawJSONLinesSchema', () => {
  it('keeps synthetic API-error messages with a null service tier', () => {
    const result = RawJSONLinesSchema.parse(syntheticRateLimitMessage);

    expect(result.type).toBe('assistant');
    if (result.type !== 'assistant') return;
    expect(result.message?.usage).toMatchObject({ input_tokens: 0, output_tokens: 0 });
  });

  it('drops malformed usage statistics without dropping the assistant turn', () => {
    const result = RawJSONLinesSchema.parse({
      ...syntheticRateLimitMessage,
      message: {
        ...syntheticRateLimitMessage.message,
        usage: { input_tokens: 'invalid' },
      },
    });

    expect(result.type).toBe('assistant');
    if (result.type !== 'assistant') return;
    expect(result.message?.usage).toBeUndefined();
    expect(result.message?.content).toEqual([{ type: 'text', text: "You've hit your limit" }]);
  });
});
