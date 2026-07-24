import { describe, expect, it } from 'vitest';
import { shouldStartIntegrationWeb } from './integrationEnvironment';

describe('integration environment service selection', () => {
  it('starts Web by default for browser-facing environments', () => {
    expect(shouldStartIntegrationWeb()).toBe(true);
    expect(shouldStartIntegrationWeb({ web: true })).toBe(true);
  });

  it('supports server-only integration environments', () => {
    expect(shouldStartIntegrationWeb({ web: false })).toBe(false);
  });
});
