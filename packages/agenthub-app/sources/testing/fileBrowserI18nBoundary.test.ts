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

const productionFiles = [
    'sources/app/(app)/machine/[id]/files.tsx',
    'sources/app/(app)/machine/[id].tsx',
    'sources/components/DirectoryTreeDrawer.tsx',
    'sources/components/FilePreviewPanel.tsx',
];

const dictionaries = { defaults, ca, en, es, it: itLocale, ja, pl, pt, ru, zhHans, zhHant };

describe('file browser i18n boundary', () => {
    it('does not ship Chinese-only copy in the production file browsing journey', () => {
        for (const relativePath of productionFiles) {
            const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
            expect(source, relativePath).not.toMatch(/[\u3400-\u9fff]/u);
        }
    });

    it('does not expose the English-only unknown error fallback', () => {
        const previewSource = fs.readFileSync(
            path.join(process.cwd(), 'sources/components/FilePreviewPanel.tsx'),
            'utf8',
        );
        expect(previewSource).not.toContain('Unknown error');
    });

    it('keeps the complete fileBrowser namespace available in every locale', () => {
        const defaultNamespace = (defaults as any).fileBrowser;
        expect(defaultNamespace).toBeDefined();
        const defaultKeys = Object.keys(defaultNamespace).sort();
        expect(defaultKeys.length).toBeGreaterThanOrEqual(25);

        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            expect(Object.keys((dictionary as any).fileBrowser ?? {}).sort(), locale).toEqual(defaultKeys);
        }
    });
});
