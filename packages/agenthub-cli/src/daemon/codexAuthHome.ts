import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createTemporaryCodexAuthHome(tokenJson: string): { path: string; cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), 'agenthub-codex-auth-'));
  writeFileSync(join(path, 'auth.json'), tokenJson, { encoding: 'utf8', mode: 0o600 });
  let cleaned = false;
  return {
    path,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      rmSync(path, { recursive: true, force: true });
    },
  };
}
