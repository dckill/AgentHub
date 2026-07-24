import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { en as defaults } from '@/text/_default';
import { ca } from '@/text/translations/ca';
import { en } from '@/text/translations/en';
import { es } from '@/text/translations/es';
import { it as italian } from '@/text/translations/it';
import { ja } from '@/text/translations/ja';
import { pl } from '@/text/translations/pl';
import { pt } from '@/text/translations/pt';
import { ru } from '@/text/translations/ru';
import { zhHans } from '@/text/translations/zh-Hans';
import { zhHant } from '@/text/translations/zh-Hant';

const projectDetails = fs.readFileSync(
    path.resolve(__dirname, '../components/ProjectDetailsSheet.tsx'),
    'utf8',
);
const projectEditor = fs.readFileSync(
    path.resolve(__dirname, '../components/ProjectEditSheet.tsx'),
    'utf8',
);
const projectIconPicker = fs.readFileSync(
    path.resolve(__dirname, '../components/ProjectIconPicker.tsx'),
    'utf8',
);
const gitLog = fs.readFileSync(
    path.resolve(__dirname, '../app/(app)/session/[id]/git-log.tsx'),
    'utf8',
);
const localeTrees = { defaults, en, ru, pl, es, it: italian, pt, ca, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja };

function getPath(source: unknown, dottedPath: string): unknown {
    return dottedPath.split('.').reduce<unknown>((value, segment) => (
        value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    ), source);
}

describe('project and Git modal accessibility boundary', () => {
    it('exposes project details as a named modal dialog with named dismiss actions', () => {
        expect(projectDetails).toContain('accessibilityViewIsModal');
        expect(projectDetails).toContain('aria-modal');
        expect(projectDetails).toContain('role="dialog"');
        expect(projectDetails).toContain("accessibilityLabel={t('project.detailsTitle')}");
        expect(projectDetails.match(/accessibilityLabel=\{t\('common\.close'\)\}/g)?.length).toBeGreaterThanOrEqual(2);
        expect(projectDetails.match(/accessibilityRole="button"/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps modal close targets at least 44 by 44 CSS pixels', () => {
        expect(projectEditor).toMatch(/closeButton:\s*\{[\s\S]*?minWidth:\s*58,[\s\S]*?height:\s*44,/);
        expect(projectDetails).toMatch(/closeButton:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44,/);
        expect(gitLog).toMatch(/modalCloseButton:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44,/);
    });

    it('names every project icon button and exposes its selected state', () => {
        expect(projectIconPicker).toContain('accessibilityRole="button"');
        expect(projectIconPicker).toContain("accessibilityLabel={t('project.selectIconAccessibility'");
        expect(projectIconPicker).toContain('accessibilityState={{ selected: isSelected }}');
        expect(projectIconPicker).toContain('aria-pressed={isSelected}');
        expect(projectIconPicker).toMatch(/iconButton:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/);
    });

    it('localizes Git metadata labels and gives every commit row a button name', () => {
        expect(gitLog).not.toMatch(/>Hash<|>Parents<|>Refs</);
        expect(gitLog).toContain("t('gitActions.hash')");
        expect(gitLog).toContain("t('gitActions.parents')");
        expect(gitLog).toContain("t('gitActions.refs')");
        expect(gitLog).toContain("accessibilityLabel={t('gitActions.openCommitDetails'");
        expect(gitLog).toContain('accessibilityRole="button"');
        expect(gitLog.match(/accessibilityLabel=\{t\('common\.close'\)\}/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('defines real Git modal copy in the default and ten locale trees', () => {
        const requiredKeys = [
            'gitActions.hash',
            'gitActions.parents',
            'gitActions.refs',
            'gitActions.openCommitDetails',
            'project.selectIconAccessibility',
        ];
        for (const [locale, tree] of Object.entries(localeTrees)) {
            for (const key of requiredKeys) {
                expect(getPath(tree, key), `${locale}:${key}`).toBeDefined();
            }
        }

        const fallback = getPath(en, 'gitActions.openCommitDetails') as (params: { subject: string; hash: string }) => string;
        for (const [locale, tree] of Object.entries(localeTrees)) {
            if (locale === 'defaults' || locale === 'en') continue;
            const localized = getPath(tree, 'gitActions.openCommitDetails') as ((params: { subject: string; hash: string }) => string) | undefined;
            expect(localized?.({ subject: 'Initial commit', hash: 'a1b2c3d' }), locale)
                .not.toBe(fallback({ subject: 'Initial commit', hash: 'a1b2c3d' }));
        }
    });
});
