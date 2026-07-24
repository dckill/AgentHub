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

const dictionaries = { defaults, ca, en, es, it: itLocale, ja, pl, pt, ru, zhHans, zhHant } as const;
const productionFiles = [
    'sources/-session/SessionView.tsx',
    'sources/app/(app)/changelog.tsx',
    'sources/app/(app)/index.tsx',
    'sources/components/messageSurfaceVisuals.ts',
    'sources/sync/fileTransferStore.ts',
    'sources/sync/suggestionCommandRules.ts',
    'sources/sync/suggestionCommands.ts',
    'sources/utils/androidBackExit.ts',
    'sources/utils/downloadDirectoryPrompt.ts',
    'sources/utils/fileTransfers.ts',
] as const;
const requiredPaths = [
    'common.backAgainToExit',
    'session.importOfficialTitle',
    'session.importOfficialDescription',
    'changelog.versionCount',
    'changelog.changeCount',
    'changelog.latestVersion',
    'toolView.stateRunning',
    'toolView.stateCompleted',
    'toolView.stateError',
    'toolView.stateUnknown',
    'slashCommands.runCommand',
    'slashCommands.useSkill',
    'slashCommands.skillFrontend',
    'slashCommands.skillDebug',
    'slashCommands.skillPlan',
    'slashCommands.skillReview',
    'slashCommands.skillTest',
    'slashCommands.skillGit',
    'slashCommands.skillGeneric',
    'transferManager.streamRetry',
    'transferManager.systemAuthorizedDirectory',
    'transferManager.appPrivateDirectory',
    'transferManager.setupDirectoryTitle',
    'transferManager.setupDirectoryMessage',
    'transferManager.setupDirectoryCancel',
    'transferManager.setupDirectoryConfirm',
] as const;

function getPath(source: unknown, dottedPath: string): unknown {
    return dottedPath.split('.').reduce<unknown>((value, segment) => (
        value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    ), source);
}

describe('runtime copy i18n boundary', () => {
    it('does not ship Chinese-only copy in shared runtime paths', () => {
        for (const relativePath of productionFiles) {
            const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
            expect(source, relativePath).not.toMatch(/[\u3400-\u9fff]/u);
        }
    });

    it('defines every runtime label in the default and ten locale trees', () => {
        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            for (const key of requiredPaths) {
                expect(getPath(dictionary, key), `${locale}:${key}`).toBeDefined();
            }
        }
    });

    it('uses localized parameterized copy instead of English fallback text', () => {
        const samples: Record<string, unknown> = {
            'changelog.versionCount': { count: 1 },
            'changelog.changeCount': { count: 1 },
            'changelog.latestVersion': { version: 123 },
            'slashCommands.runCommand': { command: 'review' },
            'slashCommands.useSkill': { skill: 'frontend-design' },
            'transferManager.streamRetry': { attempt: 2, total: 7 },
        };

        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            if (locale === 'defaults' || locale === 'en') continue;
            for (const [key, params] of Object.entries(samples)) {
                const fallback = getPath(defaults, key) as (value: unknown) => string;
                const localized = getPath(dictionary, key) as ((value: unknown) => string) | undefined;
                expect(localized?.(params), `${locale}:${key}`).not.toBe(fallback(params));
            }
        }
    });

    it('routes dynamic runtime copy through typed translations', () => {
        const suggestions = fs.readFileSync(path.join(process.cwd(), 'sources/sync/suggestionCommands.ts'), 'utf8');
        const rules = fs.readFileSync(path.join(process.cwd(), 'sources/sync/suggestionCommandRules.ts'), 'utf8');
        const transfers = fs.readFileSync(path.join(process.cwd(), 'sources/utils/fileTransfers.ts'), 'utf8');

        expect(suggestions).not.toContain("getCurrentLanguage().startsWith('zh')");
        expect(rules).toContain('getSkillInsertText');
        expect(transfers).not.toContain("from '@/text'");
        expect(transfers).toContain('fallbackLabel: string');
    });
});
