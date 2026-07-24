import { describe, expect, it } from 'vitest';
import { en as defaults } from './_default';
import { ca } from './translations/ca';
import { en } from './translations/en';
import { es } from './translations/es';
import { it as itLocale } from './translations/it';
import { ja } from './translations/ja';
import { pl } from './translations/pl';
import { pt } from './translations/pt';
import { ru } from './translations/ru';
import { zhHans } from './translations/zh-Hans';
import { zhHant } from './translations/zh-Hant';

function flattenKeys(value: unknown, prefix = ''): string[] {
    if (!value || typeof value !== 'object' || typeof value === 'function') {
        return prefix ? [prefix] : [];
    }
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

const locales = { ca, en, es, it: itLocale, ja, pl, pt, ru, zhHans, zhHant };

describe('translation parity', () => {
    it('keeps every locale key-compatible with the default translation tree', () => {
        const defaultKeys = flattenKeys(defaults).sort();

        for (const [locale, dictionary] of Object.entries(locales)) {
            expect(flattenKeys(dictionary).sort(), locale).toEqual(defaultKeys);
        }
    });

    it('does not fall back to English anywhere in the shared-link journey', () => {
        const translatedLocales = { ca, es, it: itLocale, ja, pl, pt, ru };
        const keys = Object.keys(en.externalShares) as Array<keyof typeof en.externalShares>;

        for (const [locale, dictionary] of Object.entries(translatedLocales)) {
            for (const key of keys) {
                expect(dictionary.externalShares[key], `${locale}.externalShares.${key}`)
                    .not.toBe(en.externalShares[key]);
            }
        }
    });

    it('keeps the Traditional Chinese shared-link journey free of Simplified Chinese drift', () => {
        const copy = Object.values(zhHant.externalShares).join('\n');
        expect(copy).not.toMatch(/[会动选间时来试暂载认将权]/);
    });

    it('localizes every user-facing device group lifecycle state', () => {
        const translatedLocales = { ca, es, it: itLocale, ja, pl, pt, ru };
        const keys = [
            'noUngroupedDevices', 'groupAlreadyExists', 'emptyGroup', 'emptyGroupSubtitle',
            'deviceActions', 'openDetails', 'pinToTop', 'moveUp', 'moveDown',
        ] as const;

        for (const [locale, dictionary] of Object.entries(translatedLocales)) {
            for (const key of keys) {
                expect(dictionary.machines[key], `${locale}.machines.${key}`).not.toBe(en.machines[key]);
            }
        }
    });

    it('localizes the visible and screen-reader agent goal actions', () => {
        const translatedLocales = { ca, es, it: itLocale, ja, pl, pt, ru, zhHant };
        const keys = ['currentGoal', 'clearGoal', 'stopGoal', 'editGoal'] as const;

        for (const [locale, dictionary] of Object.entries(translatedLocales)) {
            for (const key of keys) {
                expect(dictionary.components.agentGoalBar[key], `${locale}.components.agentGoalBar.${key}`)
                    .not.toBe(en.components.agentGoalBar[key]);
            }
            expect(
                dictionary.components.agentGoalBar.accessibilityLabel({ goal: 'Ship release' }),
                `${locale}.components.agentGoalBar.accessibilityLabel`,
            ).not.toBe(en.components.agentGoalBar.accessibilityLabel({ goal: 'Ship release' }));
        }
    });

    it('localizes file preview tabs and content-region labels without translating Git terms', () => {
        const translatedLocales = { ca, es, it: itLocale, ja, pl, pt, ru };
        for (const [locale, dictionary] of Object.entries(translatedLocales)) {
            for (const key of ['source', 'preview'] as const) {
                expect(dictionary.files[key], `${locale}.files.${key}`).not.toBe(en.files[key]);
            }
        }
        expect(itLocale.files.diff).not.toBe(en.files.diff);
        expect(pt.files.diff).not.toBe(en.files.diff);
    });

    it('localizes the goal command description and goal-message state', () => {
        const translatedLocales = { ca, es, it: itLocale, ja, pl, pt, ru, zhHant };
        for (const [locale, dictionary] of Object.entries(translatedLocales)) {
            expect(dictionary.slashCommands.goal, `${locale}.slashCommands.goal`).not.toBe(en.slashCommands.goal);
            expect(dictionary.message.sentAsGoal, `${locale}.message.sentAsGoal`).not.toBe(en.message.sentAsGoal);
        }
        expect(ru.settingsFeatures.commandPalette).not.toBe(en.settingsFeatures.commandPalette);
    });

    it('localizes dynamic tool summary labels instead of embedding English field names', () => {
        for (const dictionary of [itLocale, ja]) {
            expect(dictionary.tools.desc.searchPattern({ pattern: '*.ts' })).not.toMatch(/pattern:/i);
            expect(dictionary.tools.desc.searchPath({ basename: 'src' })).not.toMatch(/path:/i);
            expect(dictionary.tools.desc.todoListCount({ count: 3 })).not.toMatch(/count:/i);
            expect(dictionary.tools.desc.webSearchQuery({ query: 'AgentHub' })).not.toMatch(/query:/i);
            expect(dictionary.tools.desc.grepPattern({ pattern: 'TODO' })).not.toMatch(/pattern:/i);
        }
        for (const dictionary of [itLocale, ja, pl, ru]) {
            expect(dictionary.tools.todo.listBadge({ completed: 1, total: 3 })).not.toMatch(/^Todo\b/i);
        }
    });

    it('uses correct English singular and plural error labels', () => {
        expect(en.toolGroup.errors({ count: 1 })).toBe('1 error');
        expect(en.toolGroup.errors({ count: 2 })).toBe('2 errors');
    });

});
