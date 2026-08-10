import { describe, expect, it } from 'vitest';
import {
  getCodexCapabilities,
  isCodexAppServerAvailable,
  isCodexGoalActionsAvailable,
} from './codexCapabilities';

describe('codex capabilities', () => {
  it('parses the Codex CLI version and exposes supported capabilities', () => {
    const capabilities = getCodexCapabilities('codex-cli 0.140.1');

    expect(capabilities).toEqual({
      version: { major: 0, minor: 140, patch: 1 },
      appServer: true,
      goalActions: true,
    });
  });

  it('keeps app-server available while goal actions remain gated by the newer version', () => {
    const capabilities = getCodexCapabilities('codex-cli 0.120.9');

    expect(capabilities.appServer).toBe(true);
    expect(capabilities.goalActions).toBe(false);
    expect(isCodexAppServerAvailable('codex-cli 0.120.9')).toBe(true);
    expect(isCodexGoalActionsAvailable('codex-cli 0.120.9')).toBe(false);
  });

  it('fails closed for malformed or unsupported version output', () => {
    expect(getCodexCapabilities('codex 0.140.1')).toEqual({
      version: null,
      appServer: false,
      goalActions: false,
    });
    expect(isCodexAppServerAvailable('codex-cli 0.99.9')).toBe(false);
    expect(isCodexGoalActionsAvailable('')).toBe(false);
  });
});
