import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const serverSourceRoot = join(process.cwd(), 'sources');

function listTypeScriptFiles(directory: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            files.push(...listTypeScriptFiles(fullPath));
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

describe('protocol inventory guardrails', () => {
    const sourceFiles = listTypeScriptFiles(serverSourceRoot);

    it('keeps HTTP mutation verbs limited to GET, POST, and DELETE', () => {
        const forbiddenVerbMatches: string[] = [];
        for (const file of sourceFiles) {
            const source = readFileSync(file, 'utf8');
            const matches = source.match(/\bapp\.(put|patch)\s*\(/g) ?? [];
            for (const match of matches) {
                forbiddenVerbMatches.push(`${file}: ${match}`);
            }
        }

        expect(forbiddenVerbMatches).toEqual([]);
    });

    it('registers every non-test route module in api.ts', () => {
        const apiSource = readFileSync(join(serverSourceRoot, 'app/api/api.ts'), 'utf8');
        const routesDir = join(serverSourceRoot, 'app/api/routes');
        const routeFiles = readdirSync(routesDir)
            .filter((entry) => entry.endsWith('Routes.ts') && !entry.endsWith('.test.ts'));

        const missingRegistrations = routeFiles.filter((entry) => {
            const routeName = entry.replace(/\.ts$/, '');
            return !apiSource.includes(`import { ${routeName} }`) || !apiSource.includes(`${routeName}(typed)`);
        });

        expect(missingRegistrations).toEqual([]);
    });

    it('uses shared wire schemas for v4 sync responses', () => {
        const routeSource = readFileSync(join(serverSourceRoot, 'app/api/routes/v4SyncRoutes.ts'), 'utf8');
        expect(routeSource).toContain('@artsum/agenthub-wire');
        expect(routeSource).toContain('v4SyncResponseSchema');
    });

    it('does not log raw authorization headers', () => {
        const riskyMatches: string[] = [];
        for (const file of sourceFiles) {
            const source = readFileSync(file, 'utf8');
            if (source.includes('JSON.stringify(request.headers)') || source.includes('substring(0, 50)')) {
                riskyMatches.push(file);
            }
        }

        expect(riskyMatches).toEqual([]);
    });

    it('requires debug log route authentication when enabled', () => {
        const routeSource = readFileSync(join(serverSourceRoot, 'app/api/routes/devRoutes.ts'), 'utf8');
        expect(routeSource).toContain('preHandler: authenticateDebugLogRequest');
        expect(routeSource).toContain('AGENTHUB_DEBUG_LOG_SECRET');
        expect(routeSource).toContain("DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING === 'true'");
    });
});
