import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { en as defaultTranslations } from '@/text/_default';
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

const sourcePath = path.resolve(__dirname, '../utils/sessionUtils.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const expectedKeys = [
    'working',
    'thinking',
    'reviewingContext',
    'preparingNextStep',
    'checkingChanges',
    'readingToolOutput',
    'refiningJudgment',
    'composingReply',
    'calibratingDirection',
    'completingThoughts',
    'approachingAnswer',
    'polishingExpression',
] as const;

const localeTrees = {
    en,
    ru,
    pl,
    es,
    it: italian,
    pt,
    ca,
    'zh-Hans': zhHans,
    'zh-Hant': zhHant,
    ja,
};

describe('session thinking copy i18n boundary', () => {
    it('does not branch on Chinese or ship locale-specific message arrays', () => {
        expect(source).not.toMatch(/getCurrentLanguage|startsWith\(['"]zh['"]\)/);
        expect(source).not.toMatch(/thinkingStatusMessages(?:Zh|En)/);
        expect(source).not.toMatch(/[\u3400-\u9fff]/u);
    });

    it('defines the complete typed message set in the default and ten locale trees', () => {
        const canonical = (defaultTranslations as any).sessionThinking;
        expect(Object.keys(canonical).sort()).toEqual([...expectedKeys].sort());

        for (const [locale, tree] of Object.entries(localeTrees)) {
            const messages = (tree as any).sessionThinking;
            expect(Object.keys(messages).sort(), locale).toEqual([...expectedKeys].sort());
            for (const key of expectedKeys) {
                expect(messages[key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
            }
        }
    });

    it('uses typed translation keys for every rotating status message', () => {
        for (const key of expectedKeys) {
            expect(source).toContain(`t('sessionThinking.${key}')`);
        }
    });

    it('keeps English aligned with the default and supplies real non-English copy', () => {
        expect((en as any).sessionThinking).toEqual((defaultTranslations as any).sessionThinking);
        for (const [locale, tree] of Object.entries(localeTrees).filter(([locale]) => locale !== 'en')) {
            const translated = expectedKeys.filter(
                (key) => (tree as any).sessionThinking[key] !== (en as any).sessionThinking[key],
            );
            expect(translated.length, locale).toBeGreaterThanOrEqual(6);
        }
    });

    it('preserves the previously approved Simplified Chinese thinking copy', () => {
        expect(expectedKeys.map((key) => (zhHans as any).sessionThinking[key])).toEqual([
            '正在想一想',
            '正在理清思路',
            '正在理解你的意图',
            '正在斟酌下一步',
            '正在把线索串起来',
            '正在权衡方案',
            '正在沉淀判断',
            '正在组织回答',
            '正在校准方向',
            '正在补全思路',
            '正在靠近答案',
            '正在整理表达',
        ]);
    });
});
