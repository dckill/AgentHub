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
    'sources/app/(app)/_layout.tsx',
    'sources/app/(app)/new/index.tsx',
    'sources/app/(app)/session/[id]/git-log.tsx',
    'sources/components/ActiveSessionsGroupCompact.tsx',
    'sources/components/FAB.tsx',
    'sources/components/ProjectEditSheet.tsx',
];
const requiredPaths = [
    'common.close',
    'newSession.browseFolderAccessibility',
    'newSession.selectMachineAccessibility',
    'newSession.switchAgentAccessibility',
    'newSession.switchPermissionAccessibility',
    'newSession.selectWorktreeAccessibility',
    'project.editSubtitle',
    'project.nameLabel',
    'project.nameHint',
    'project.iconHint',
    'project.expandMachineAccessibility',
    'project.collapseMachineAccessibility',
    'project.dismissEditorAccessibility',
    'gitActions.commitDetails',
] as const;
const localizedSetupPaths = [
    'newSession.setupTitle',
    'newSession.setupSubtitle',
    'newSession.advancedSettings',
    'newSession.setup.machine.title',
    'newSession.setup.machine.description',
    'newSession.setup.machineOffline.description',
    'newSession.setup.path.title',
    'newSession.setup.path.description',
    'newSession.setup.agent.title',
    'newSession.setup.agent.description',
    'newSession.setup.permission.title',
    'newSession.setup.permission.description',
    'newSession.setup.credential.title',
    'newSession.setup.credential.description',
    'newSession.setup.worktree.title',
    'newSession.setup.worktree.description',
] as const;

function getPath(source: unknown, dottedPath: string): unknown {
    return dottedPath.split('.').reduce<unknown>((value, segment) => (
        value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined
    ), source);
}

describe('session entry and project workbench i18n boundary', () => {
    it('does not ship Chinese-only copy in the core session-entry journey', () => {
        for (const relativePath of productionFiles) {
            const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
            expect(source, relativePath).not.toMatch(/[\u3400-\u9fff]/u);
        }
    });

    it('keeps every new dynamic label in default plus ten locale trees', () => {
        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            for (const key of requiredPaths) {
                expect(getPath(dictionary, key), `${locale}:${key}`).toBeDefined();
            }
        }
    });

    it('does not disguise English dynamic labels as localized copy', () => {
        const samples: Record<string, unknown[]> = {
            'newSession.browseFolderAccessibility': [{ folder: '/repo' }],
            'newSession.selectMachineAccessibility': [{ machine: 'build-node' }],
            'newSession.switchAgentAccessibility': [{ agent: 'Codex' }],
            'newSession.switchPermissionAccessibility': [{ mode: 'Plan' }],
            'newSession.selectWorktreeAccessibility': [{ worktree: 'feature' }],
            'project.expandMachineAccessibility': [{ machine: 'build-node' }],
            'project.collapseMachineAccessibility': [{ machine: 'build-node' }],
        };

        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            if (locale === 'defaults' || locale === 'en') continue;
            for (const [key, args] of Object.entries(samples)) {
                const fallback = getPath(defaults, key) as (value: unknown) => string;
                const localized = getPath(dictionary, key) as ((value: unknown) => string) | undefined;
                expect(localized?.(args[0]), `${locale}:${key}`).not.toBe(fallback(args[0]));
            }
        }
    });

    it('localizes the complete New Session setup card in every non-English locale', () => {
        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            if (locale === 'defaults' || locale === 'en') continue;
            for (const key of localizedSetupPaths) {
                expect(getPath(dictionary, key), `${locale}:${key}`).not.toBe(getPath(defaults, key));
            }
        }
    });

    it('makes the project editor and compact entry actions explicitly operable', () => {
        const projectEditor = fs.readFileSync(path.join(process.cwd(), 'sources/components/ProjectEditSheet.tsx'), 'utf8');
        const fab = fs.readFileSync(path.join(process.cwd(), 'sources/components/FAB.tsx'), 'utf8');
        const gitLog = fs.readFileSync(path.join(process.cwd(), 'sources/app/(app)/session/[id]/git-log.tsx'), 'utf8');

        expect(projectEditor).toContain('accessibilityViewIsModal');
        expect(projectEditor).toContain('aria-modal');
        expect(projectEditor).toContain("accessibilityLabel={t('project.nameLabel')}");
        expect(projectEditor.match(/accessibilityRole="button"/g)?.length).toBeGreaterThanOrEqual(3);
        expect(fab).toContain("accessibilityLabel ?? t('newSession.title')");
        expect(gitLog).toContain("accessibilityLabel={t('common.close')}");
    });
});
