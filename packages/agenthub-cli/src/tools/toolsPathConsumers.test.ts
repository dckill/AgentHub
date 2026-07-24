import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cliRoot = resolve(__dirname, '..', '..');

describe('runtime tools path consumers', () => {
    it('routes every production binary and provider metadata consumer through one resolver', () => {
        const consumers = [
            'src/modules/difftastic/index.ts',
            'scripts/ripgrep_launcher.cjs',
            'src/utils/createSessionMetadata.ts',
            'src/claude/runClaude.ts',
        ];

        for (const relativePath of consumers) {
            const source = readFileSync(resolve(cliRoot, relativePath), 'utf8');
            expect(source, relativePath).toContain('resolveBundledToolsDir');
            expect(source, relativePath).not.toMatch(/projectPath\(\),\s*['"]tools['"],\s*['"]unpacked['"]/);
        }
    });
});
