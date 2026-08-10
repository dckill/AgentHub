import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactSensitiveLogData, redactSensitiveString } from './logger';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; vi.resetModules(); });

describe('recursive log redaction', () => {
  it('redacts serialized credential payloads from message strings', () => {
    const serialized = JSON.stringify({
      token: 'sk-ant-oat01-plain-text-secret',
      ANTHROPIC_AUTH_TOKEN: 'sk-ant-api03-plain-text-secret',
      OPENAI_API_KEY: 'sk-proj-plain-text-secret',
      apiKey: 'plain-api-key-secret',
    });

    const redacted = redactSensitiveString(serialized);

    expect(redacted).not.toContain('plain-text-secret');
    expect(redacted).not.toContain('plain-api-key-secret');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts nested secret fields, bearer headers, URL credentials/query values and Error text', () => {
    const secrets = ['bearer-value', 'nested-token', 'api-key-value', 'url-password', 'query-secret'];
    const value = {
      authorization: 'Bearer bearer-value',
      nested: { token: 'nested-token', apiKey: 'api-key-value', safe: 'visible' },
      url: 'https://user:url-password@example.com/path?token=query-secret&view=compact',
      error: new Error('request failed Authorization: Bearer bearer-value token=query-secret'),
    };

    const serialized = JSON.stringify(redactSensitiveLogData(value));

    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized).toContain('visible');
    expect(serialized).toContain('[REDACTED]');
  });

  it('handles circular objects without leaking or throwing', () => {
    const value: any = { password: 'circular-secret' };
    value.self = value;

    expect(() => redactSensitiveLogData(value)).not.toThrow();
    expect(JSON.stringify(redactSensitiveLogData(value))).not.toContain('circular-secret');
  });

  it('applies redaction and mode 0600 at the actual file sink', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agenthub-logger-'));
    process.env.AGENTHUB_HOME_DIR = home;
    vi.resetModules();
    try {
      const { logger } = await import('./logger');
      logger.debug('Authorization: Bearer file-bearer-secret', {
        nested: { refreshToken: 'file-refresh-secret', safe: 'kept' },
      });
      const content = readFileSync(logger.logFilePath, 'utf8');
      expect(content).not.toContain('file-bearer-secret');
      expect(content).not.toContain('file-refresh-secret');
      expect(content).toContain('kept');
      expect(statSync(logger.logFilePath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
