import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacyPrefix = ['ha', 'ppy'].join('');
const legacyBrand = ['Ha', 'ppy'].join('');

describe('AgentHub CLI branding', () => {
  it('ships agenthub as the primary command without legacy bins', () => {
    const packageJson = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')) as {
      bin?: Record<string, string>;
    };

    expect(packageJson.bin?.agenthub).toBe('./bin/agenthub.mjs');
    expect(packageJson.bin?.[legacyPrefix]).toBeUndefined();
    expect(packageJson.bin?.[`${legacyPrefix}-mcp`]).toBeUndefined();
    expect(existsSync(resolve(packageDir, 'bin', 'agenthub.mjs'))).toBe(true);
    expect(existsSync(resolve(packageDir, 'bin', `${legacyPrefix}.mjs`))).toBe(false);
  });

  it('uses AgentHub wording in the visible CLI help source', () => {
    const source = readFileSync(resolve(packageDir, 'src', 'index.ts'), 'utf8');

    expect(source).toContain('AgentHub - Claude Code and Codex workspace');
    expect(source).toContain('agenthub [options]');
    expect(source).not.toContain('Claude Code On the Go');
    expect(source).not.toContain(`${legacyBrand} supports ALL Claude options`);
  });

  it('prints the AgentHub version without delegating to Claude Code', () => {
    const source = readFileSync(resolve(packageDir, 'src', 'index.ts'), 'utf8');

    expect(source).toContain('if (showVersion) {');
    expect(source).toContain('process.exit(0)');
    expect(source).not.toContain("Don't exit - continue to pass --version to Claude Code");
  });
});
