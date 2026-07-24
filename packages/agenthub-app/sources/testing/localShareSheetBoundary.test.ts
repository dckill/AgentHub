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

const source = fs.readFileSync(path.resolve(__dirname, '../app/(app)/text-selection.tsx'), 'utf8');
const localeTrees = { defaults, en, ru, pl, es, it: italian, pt, ca, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja };

function getPath(sourceTree: unknown, dottedPath: string): unknown {
    return dottedPath.split('.').reduce<unknown>((value, segment) => (
        value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    ), sourceTree);
}

describe('local content Share Sheet boundary', () => {
    it('adds named 44px copy and share actions to explicit text selection', () => {
        expect(source).toContain('handleShare');
        expect(source).toContain("accessibilityLabel={t('textSelection.share')}");
        expect(source).toContain("accessibilityLabel={t('common.copy')}");
        expect(source.match(/accessibilityRole="button"/g)?.length).toBeGreaterThanOrEqual(2);
        expect(source).toMatch(/headerAction:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44,/);
    });

    it('defines local-share feedback in default plus ten locale trees', () => {
        const keys = [
            'textSelection.share',
            'textSelection.shareTitle',
            'textSelection.failedToShare',
            'textSelection.noTextToShare',
        ];
        for (const [locale, tree] of Object.entries(localeTrees)) {
            for (const key of keys) {
                expect(getPath(tree, key), `${locale}:${key}`).toBeDefined();
            }
        }
    });
});
