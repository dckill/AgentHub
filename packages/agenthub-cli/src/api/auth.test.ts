import { describe, expect, it } from 'vitest';
import { generateAppUrl } from './auth';

describe('auth app URL generation', () => {
  it('uses the AgentHub URL scheme for mobile account linking', () => {
    const url = generateAppUrl(new Uint8Array([1, 2, 3, 4]));

    expect(url).toBe('agenthub://AQIDBA');
  });
});
