import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

describe('tracked secret policy', () => {
    it('does not track runtime env or Kubernetes Secret manifests with concrete values', () => {
        const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
            .trim().split('\n').filter(Boolean);
        const forbidden = tracked.filter(file =>
            /(^|\/)\.env(?:\.|$)/.test(file) || /(^|\/)secrets?\.ya?ml$/i.test(file)
        ).filter(file => {
            if (!existsSync(resolve(repoRoot, file))) return false;
            if (/\.example(?:\.|$)/.test(file) || /examples?\//.test(file)) return false;
            const content = readFileSync(resolve(repoRoot, file), 'utf8');
            return /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*[:=]\s*[^\s#<{][^\r\n]*/i.test(content);
        });

        expect(forbidden).toEqual([]);
    });
});
