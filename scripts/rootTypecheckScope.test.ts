import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('root TypeScript scope', () => {
  it('excludes generated Tauri target artifacts from the source typecheck', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8')) as {
      exclude?: unknown;
    };

    expect(Array.isArray(config.exclude)).toBe(true);
    expect(config.exclude as string[]).toContain('packages/agenthub-app/src-tauri/target');
  });
});
