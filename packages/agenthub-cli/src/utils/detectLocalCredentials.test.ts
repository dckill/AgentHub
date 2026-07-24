import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { existsSync, readFileSync, homedir } = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  homedir: vi.fn(() => '/home/tester'),
}));

vi.mock('fs', () => ({ existsSync, readFileSync }));
vi.mock('os', () => ({ default: { homedir } }));

import { detectLocalCredentials } from './detectLocalCredentials';

const originalEnv = { ...process.env };

describe('detectLocalCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CODEX_HOME;
    delete process.env.OPENAI_API_KEY;
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('detects credentials from config files and env vars', () => {
    existsSync.mockImplementation((path: string) => path.endsWith('/.claude/settings.json') || path.endsWith('/codex-home/auth.json'));
    readFileSync.mockReturnValue(JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'claude-token' } }));
    process.env.CODEX_HOME = '/codex-home';

    expect(detectLocalCredentials()).toEqual({
      claude: true,
      codex: true,
      detectedAt: 1700000000000,
    });
  });

  it('falls back to env vars and ignores malformed Claude settings', () => {
    existsSync.mockImplementation((path: string) => path.endsWith('/.claude/settings.json'));
    readFileSync.mockReturnValue('{bad json');
    process.env.ANTHROPIC_API_KEY = 'claude-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    expect(detectLocalCredentials()).toMatchObject({
      claude: true,
      codex: true,
    });
  });

});
