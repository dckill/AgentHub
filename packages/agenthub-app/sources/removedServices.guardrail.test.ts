import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const packageRoot = process.cwd();
const repoRoot = join(packageRoot, '../..');

function listFiles(directory: string): string[] {
    const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.expo', 'coverage']);
    const files: string[] = [];
    for (const entry of readdirSync(directory)) {
        if (ignored.has(entry)) continue;
        const fullPath = join(directory, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            files.push(...listFiles(fullPath));
        } else if (/\.(ts|tsx|js|json|cjs)$/.test(entry) && !entry.endsWith('.guardrail.test.ts') && !fullPath.includes('/sources/changelog/')) {
            files.push(fullPath);
        }
    }
    return files;
}

describe('removed service guardrails', () => {
    it('does not reintroduce upstream hosted service references', () => {
        const riskyMatches: string[] = [];
        for (const file of listFiles(packageRoot)) {
            const source = readFileSync(file, 'utf8').toLowerCase();
            if (source.includes('agenthub.engineering') || source.includes('posthog') || source.includes('revenuecat')) {
                riskyMatches.push(file.replace(`${repoRoot}/`, ''));
            }
        }

        expect(riskyMatches).toEqual([]);
    });

    it('does not reintroduce removed voice provider dependencies', () => {
        const riskyMatches: string[] = [];
        for (const file of listFiles(packageRoot)) {
            const source = readFileSync(file, 'utf8').toLowerCase();
            if (source.includes('elevenlabs') || source.includes('livekit')) {
                riskyMatches.push(file.replace(`${repoRoot}/`, ''));
            }
        }

        expect(riskyMatches).toEqual([]);
    });
});
