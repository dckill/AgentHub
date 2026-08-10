import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(path.resolve(__dirname, '../components', file), 'utf8');

describe('accessibility permission batch', () => {
    it('describes ask-user options and submission state', () => {
        const content = source('tools/views/AskUserQuestionView.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={option.label}');
        expect(content).toContain('accessibilityState={{ selected: isSelected, disabled: !canInteract }}');
        expect(content).toContain("accessibilityLabel={t('tools.askUserQuestion.submit')}");
    });

    it('describes every permission decision branch', () => {
        const content = source('tools/PermissionFooter.tsx');
        expect((content.match(/accessibilityRole="button"/g) ?? []).length).toBe(8);
        expect(content).toContain("accessibilityLabel={t('common.yes')}");
        expect(content).toContain("accessibilityLabel={t('codex.permissions.yesForSession')}");
        expect(content).toContain("accessibilityLabel={t('codex.permissions.stopAndExplain')}");
        expect(content).toContain("accessibilityLabel={t('claude.permissions.yesAllowAllEdits')}");
        expect(content).toContain("accessibilityLabel={t('claude.permissions.yesAllowEverything')}");
        expect(content).toContain("accessibilityLabel={t('claude.permissions.yesForTool')}");
        expect(content).toContain("accessibilityLabel={t('claude.permissions.noTellClaude')}");
    });

    it('names navigable tool details', () => {
        const content = source('tools/ToolView.tsx');
        expect(content).toContain('accessibilityRole="button"');
        expect(content).toContain('accessibilityLabel={toolTitle}');
    });
});
