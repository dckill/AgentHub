import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(
    path.resolve(__dirname, '../components', file),
    'utf8',
);

describe('folder and inline diff accessibility batch', () => {
    it('names folder navigation and directory actions', () => {
        const content = source('FolderBrowser.tsx');
        expect(content).toContain("accessibilityLabel={t('common.home')}");
        expect(content).toContain("accessibilityLabel={t('newSession.parentFolder')}");
        expect(content).toContain("accessibilityLabel={t('newSession.showHidden')}");
        expect(content).toContain("accessibilityLabel={t('newSession.newFolder')}");
        expect(content).toContain('accessibilityLabel={entry.name}');
    });

    it('names inline diff close, style, and loading controls', () => {
        const content = source('InlineFileDiff.tsx');
        expect(content).toContain("accessibilityLabel={t('common.close')}");
        expect(content).toContain("accessibilityLabel={t('settingsAppearance.diffStyleOptions.unified')}");
        expect(content).toContain("accessibilityLabel={t('settingsAppearance.diffStyleOptions.split')}");
        expect(content).toContain("accessibilityLabel={t('common.loading')}");
    });
});
