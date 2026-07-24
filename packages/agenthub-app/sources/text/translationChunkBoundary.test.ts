import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGE_CODES } from './_all';

describe('translation chunk boundary', () => {
    it('loads one non-English language on Web while preserving the Native map', () => {
        const textRuntime = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
        const webLoader = readFileSync(resolve(__dirname, 'translationLoader.web.ts'), 'utf8');
        const nativeLoader = readFileSync(resolve(__dirname, 'translationLoader.ts'), 'utf8');
        const rootLayout = readFileSync(resolve(__dirname, '../app/_layout.tsx'), 'utf8');

        expect(textRuntime).not.toMatch(/from ['"]\.\/translations\//);
        expect(textRuntime).toContain('export async function loadCurrentTranslations()');
        expect(textRuntime).toContain('translations[currentLanguage] ?? en');
        expect(rootLayout).toContain('await loadCurrentTranslations()');

        for (const language of SUPPORTED_LANGUAGE_CODES.filter((code) => code !== 'en')) {
            expect(webLoader).toContain(`case '${language}'`);
            expect(webLoader).toContain(`import('./translations/${language}')`);
            expect(nativeLoader).toContain(`from './translations/${language}'`);
        }
    });
});
