import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(
    path.resolve(__dirname, '../components', file),
    'utf8',
);

describe('selector and OAuth accessibility batch', () => {
    it('names SearchableListSelector section, favorite, and removal actions', () => {
        const content = source('SearchableListSelector.tsx');
        expect(content).toContain("accessibilityLabel={t('common.close')}");
        expect(content).toContain('accessibilityLabel={config.recentSectionTitle}');
        expect(content).toContain('accessibilityLabel={config.favoritesSectionTitle}');
        expect(content).toContain("accessibilityLabel={`${t('common.delete')} ${title}`}");
    });

    it('names OAuth retry action and exposes loading status', () => {
        const content = source('OAuthView.tsx');
        expect(content).toContain("accessibilityLabel={t('common.retry')}");
        expect(content).toContain("accessibilityLabel={t('common.loading')}");
        expect(content).toContain("accessibilityLabel={t('settings.exchangingTokens')}");
    });
});
