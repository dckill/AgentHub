import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { getChangelogEntries } from './parser';
import { assertLocaleParity, generateChangelogCatalog } from '../scripts/parseChangelog';
import type { ChangelogCatalog } from './types';

const appRoot = path.resolve(__dirname, '../..');
const englishSourcePath = path.join(appRoot, 'CHANGELOG.en.md');
const generatedCatalogPath = path.join(__dirname, 'changelog.json');

const containsHan = (value: string): boolean => /[\u3400-\u9fff]/u.test(value);

describe('localized changelog contract', () => {
    it('ships an English canonical source without Chinese fallback copy', () => {
        expect(fs.existsSync(englishSourcePath)).toBe(true);

        const source = fs.readFileSync(englishSourcePath, 'utf8');
        expect(source).toContain('# Changelog');
        expect(source).toContain('## Version 19 - 2026-07-18');
        expect(containsHan(source)).toBe(false);
    });

    it('generates an English-default manifest without embedding localized bodies', () => {
        const catalog = JSON.parse(fs.readFileSync(generatedCatalogPath, 'utf8')) as {
            defaultLocale?: string;
            locales?: Record<string, { latestVersion: number }>;
        };

        expect(catalog.defaultLocale).toBe('en');
        expect(Object.keys(catalog.locales ?? {})).toEqual(['en', 'zh-Hans']);
        expect(catalog.locales?.en.latestVersion).toBe(19);
        expect(catalog.locales?.['zh-Hans'].latestVersion).toBe(19);
        expect(JSON.stringify(catalog)).not.toContain('entries');
    });

    it('selects exact localized bodies and falls back to English for unsupported locales', async () => {
        const englishEntries = await getChangelogEntries('en');
        const simplifiedChineseEntries = await getChangelogEntries('zh-Hans');
        const traditionalChineseFallback = await getChangelogEntries('zh-Hant');
        const japaneseFallback = await getChangelogEntries('ja');

        expect(englishEntries).toHaveLength(18);
        expect(containsHan(JSON.stringify(englishEntries))).toBe(false);
        expect(containsHan(JSON.stringify(simplifiedChineseEntries))).toBe(true);
        expect(traditionalChineseFallback).toEqual(englishEntries);
        expect(japaneseFallback).toEqual(englishEntries);
    });

    it('does not duplicate parsed fields in generated raw Markdown', () => {
        const entries = ['en', 'zh-Hans'].flatMap((locale) => {
            const localePath = path.join(__dirname, `changelog.${locale}.json`);
            const data = JSON.parse(fs.readFileSync(localePath, 'utf8')) as {
                entries: Array<Record<string, unknown>>;
            };
            return data.entries;
        });

        expect(entries.length).toBeGreaterThan(0);
        expect(entries.every((entry) => !('rawMarkdown' in entry))).toBe(true);
    });

    it('keeps the committed catalog reproducible from both source documents', () => {
        const generated = generateChangelogCatalog();
        for (const [locale, data] of Object.entries(generated.locales)) {
            const localePath = path.join(__dirname, `changelog.${locale}.json`);
            expect(data).toEqual(JSON.parse(fs.readFileSync(localePath, 'utf8')));
        }
    });

    it('rejects locale drift instead of publishing partially translated history', () => {
        const catalog = generateChangelogCatalog();
        const driftedCatalog = structuredClone(catalog) as ChangelogCatalog;
        driftedCatalog.locales['zh-Hans'].entries[0].changes.pop();

        expect(() => assertLocaleParity('en', driftedCatalog)).toThrow(
            'zh-Hans: version 19 has 7 changes; expected 8',
        );
    });
});

describe('localized changelog bundle boundary', () => {
    it('loads each Web locale through a dedicated dynamic import', () => {
        const webLoader = fs.readFileSync(path.join(__dirname, 'loader.web.ts'), 'utf8');
        expect(webLoader).toContain("import('./changelog.en.json')");
        expect(webLoader).toContain("import('./changelog.zh-Hans.json')");
        expect(webLoader).not.toMatch(/^import .*changelog\.(?:en|zh-Hans)\.json/mu);
    });
});
