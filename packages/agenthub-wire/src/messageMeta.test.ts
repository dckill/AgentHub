import { describe, expect, it } from 'vitest';
import { MessageMetaSchema } from './messageMeta';

describe('MessageMetaSchema', () => {
  it('preserves the device that originated a turn', () => {
    expect(MessageMetaSchema.parse({ turnOriginDevice: 'device-a' }).turnOriginDevice).toBe('device-a');
  });

  it('rejects blank turn origin device ids', () => {
    expect(MessageMetaSchema.safeParse({ turnOriginDevice: '   ' }).success).toBe(false);
  });
});
