import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWritePrivateJson } from './atomicPrivateJson';

describe('atomic private JSON persistence', () => {
  it('keeps the previous valid state if failure occurs before rename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agenthub-atomic-state-'));
    const file = join(dir, 'daemon.state.json');
    writeFileSync(file, JSON.stringify({ generation: 'old' }), { mode: 0o600 });
    try {
      expect(() => atomicWritePrivateJson(file, { generation: 'new' }, {
        beforeRename: () => { throw new Error('injected-before-rename'); },
      })).toThrow('injected-before-rename');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ generation: 'old' });
      expect(readdirSync(dir).filter(name => name.includes('.tmp'))).toEqual([]);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
