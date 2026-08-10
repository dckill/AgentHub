import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const helperSource = readFileSync(join(__dirname, '..', 'sync/permissionActionLifecycle.ts'), 'utf8');
const footerSource = readFileSync(join(__dirname, '..', 'components/tools/PermissionFooter.tsx'), 'utf8');
const questionSource = readFileSync(join(__dirname, '..', 'components/tools/views/AskUserQuestionView.tsx'), 'utf8');

describe('Permission action account lifecycle boundary', () => {
    it('binds permission decisions to the account generation that started them', () => {
        expect(helperSource).toContain('sync.getAccountGeneration()');
        expect(helperSource).toContain('runSessionActionRequest({');
        expect(footerSource).toContain("import { runPermissionAction } from '@/sync/permissionActionLifecycle';");
        expect(footerSource).toContain('const result = await runPermissionAction(');
        expect(footerSource).toContain('if (result === null) return;');
    });

    it('guards AskUserQuestion answers against a stale account', () => {
        expect(questionSource).toContain("import { runPermissionAction } from '@/sync/permissionActionLifecycle';");
        expect(questionSource).toContain('const result = await runPermissionAction(');
        expect(questionSource).toContain('if (result === null) return;');
    });
});
