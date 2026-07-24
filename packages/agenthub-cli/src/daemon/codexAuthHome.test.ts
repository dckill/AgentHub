import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createTemporaryCodexAuthHome } from './codexAuthHome';

describe('temporary Codex auth home', () => {
  it('uses private modes and removes the token directory idempotently', () => {
    const resource = createTemporaryCodexAuthHome('{"access_token":"temporary-secret"}');
    const authFile = `${resource.path}/auth.json`;
    try {
      expect(statSync(resource.path).mode & 0o777).toBe(0o700);
      expect(statSync(authFile).mode & 0o777).toBe(0o600);
      expect(readFileSync(authFile, 'utf8')).toContain('temporary-secret');
    } finally {
      resource.cleanup();
      resource.cleanup();
    }
    expect(existsSync(resource.path)).toBe(false);
  });
});
