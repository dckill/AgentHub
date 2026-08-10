import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

describe('sync permission mode dependency boundary', () => {
    it('keeps sync modules independent from the PermissionModeSelector UI component', () => {
        for (const file of ['storage.ts', 'persistence.ts', 'messageMeta.ts']) {
            const source = readFileSync(resolve(repoRoot, `packages/agenthub-app/sources/sync/${file}`), 'utf8');
            expect(source).not.toContain("@/components/PermissionModeSelector");
            expect(source).toContain("@/utils/permissionMode");
        }
    });
});
