import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en as defaults } from '../text/_default';
import { ca } from '../text/translations/ca';
import { en } from '../text/translations/en';
import { es } from '../text/translations/es';
import { it as itLocale } from '../text/translations/it';
import { ja } from '../text/translations/ja';
import { pl } from '../text/translations/pl';
import { pt } from '../text/translations/pt';
import { ru } from '../text/translations/ru';
import { zhHans } from '../text/translations/zh-Hans';
import { zhHant } from '../text/translations/zh-Hant';

const dictionaries = { defaults, ca, en, es, it: itLocale, ja, pl, pt, ru, zhHans, zhHant };

describe('transfer manager i18n boundary', () => {
    it('does not ship Chinese-only copy in the production transfer manager', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        expect(source).not.toMatch(/[\u3400-\u9fff]/u);
    });

    it('keeps the complete transferManager namespace available in every locale', () => {
        const defaultNamespace = (defaults as any).transferManager;
        expect(defaultNamespace).toBeDefined();
        const defaultKeys = Object.keys(defaultNamespace).sort();
        expect(defaultKeys.length).toBeGreaterThanOrEqual(50);

        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            expect(Object.keys((dictionary as any).transferManager ?? {}).sort(), locale).toEqual(defaultKeys);
        }
    });

    it('does not disguise the English fallback as a localized transfer manager', () => {
        const englishEntries = Object.entries((defaults as any).transferManager)
            .filter(([, value]) => typeof value === 'string');

        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            if (locale === 'defaults' || locale === 'en') continue;
            const localized = (dictionary as any).transferManager;
            const translatedCount = englishEntries.filter(([key, englishValue]) => localized[key] !== englishValue).length;
            expect(translatedCount / englishEntries.length, locale).toBeGreaterThanOrEqual(0.7);
        }
    });

    it('gives the transfer row icon actions explicit button names', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        expect(source).toContain('accessibilityRole="button"');
        expect(source.match(/accessibilityLabel=\{t\('transferManager\./g)?.length).toBeGreaterThanOrEqual(6);
    });

    it('exposes the non-empty transfer journey as named controls and live progress', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        expect(source).toContain('accessibilityRole="tablist"');
        expect(source).toContain('aria-selected={selected}');
        expect(source).toContain('accessibilityRole="progressbar"');
        expect(source).toContain('accessibilityValue={{ min: 0, max: 100, now: progressPercent }}');
        expect(source).toContain("aria-valuenow={progressPercent}");
        expect(source).toContain("aria-valuemin={0}");
        expect(source).toContain("aria-valuemax={100}");
        expect(source).toContain('accessibilityLabel={taskAccessibilityLabel}');
        expect(source).toContain('accessibilityLiveRegion="polite"');
    });

    it('does not expose raw platform transfer errors in localized rows or details', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        const rowStart = source.indexOf('function TransferTaskRow');
        const rowEnd = source.indexOf('function IconButton', rowStart);
        const row = rowStart >= 0 && rowEnd > rowStart ? source.slice(rowStart, rowEnd) : '';

        expect(source).toContain('function getLocalizedTransferError(error: string | undefined)');
        expect(source).toContain("return t('transferManager.unavailableLocalDirectory');");
        expect(source).toContain("return t('transferManager.unknownError');");
        expect(row).toContain('const localizedError = getLocalizedTransferError(task.error);');
        expect(row).not.toContain('task.error]');
        expect(row).not.toContain('{task.error}');
        expect(source).toContain("value={getLocalizedTransferError(task.error) ?? t('transferManager.unknownError')}");
    });

    it('names every interactive detail and removal control', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        expect(source).toContain('accessibilityLabel={label}');
        expect(source).toContain('accessibilityLabel={t(\'transferManager.deleteLocalFile\')}');
        expect(source.match(/accessibilityRole="button"/g)?.length).toBeGreaterThanOrEqual(4);
    });

    it('opens a task detail once when navigation supplies taskId', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        expect(source).toContain('findTransferTaskById(tasks, params.taskId)');
        expect(source).toContain('openedTaskIdRef.current = task.id');
    });

    it('keeps every status filter visible and every transfer action at least 44 points', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/transfers.tsx'),
            'utf8',
        );
        const filterStart = source.indexOf('function TransferFilterTabs');
        const filterEnd = source.indexOf('function DetailRow', filterStart);
        const filters = filterStart >= 0 && filterEnd > filterStart ? source.slice(filterStart, filterEnd) : '';
        const emptyItem = source.match(/<Item\s+[\s\S]*?title=\{t\('transferManager\.noTasks'\)\}[\s\S]*?\/>/)?.[0] ?? '';

        expect(filters).not.toContain('<ScrollView');
        expect(filters).toContain('styles.tabsScroller');
        expect(filters).toContain('minHeight: s(44)');
        expect(filters).toContain('numberOfLines={2}');
        expect(filters).toContain('const compactFilters = width < 480;');
        expect(filters).toContain("flexBasis: compactFilters ? '45%' : '30%'");
        expect(source).toMatch(/tabsScroller:\s*\{[\s\S]{0,160}flexWrap: 'wrap',/);
        expect(source).toMatch(/headerMenuButton:\s*\{[\s\S]{0,100}width: 44,[\s\S]{0,60}height: 44,/);
        expect(source).toContain('<ItemList role="main">');
        expect(emptyItem).toContain('titleLines={0}');
        expect(emptyItem).toContain('subtitleLines={0}');
    });
});
