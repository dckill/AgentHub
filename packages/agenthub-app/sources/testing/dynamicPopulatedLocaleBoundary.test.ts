import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en as defaults } from '../text/_default';
import { ca } from '../text/translations/ca';
import { es } from '../text/translations/es';
import { it as itLocale } from '../text/translations/it';
import { ja } from '../text/translations/ja';
import { pl } from '../text/translations/pl';
import { pt } from '../text/translations/pt';
import { ru } from '../text/translations/ru';

const localizedDictionaries = { ca, es, it: itLocale, ja, pl, pt, ru } as const;
const legitimateIdenticalUsageTerms: Partial<Record<keyof typeof localizedDictionaries, readonly string[]>> = {
    ca: ['metricTotal'],
    es: ['metricTotal'],
    it: ['metricInput', 'metricOutput'],
    pt: ['metricTotal'],
};

const usageStringKeys = [
    'tokens',
    'notAuthenticated',
    'loadFailed',
    'period',
    'agentScope',
    'agentAll',
    'agentUnknown',
    'periodTokens',
    'activeReports',
    'peakBucket',
    'cacheReuse',
    'tokenMix',
    'axisTokens',
    'axisTime',
    'modelGuideButton',
    'modelGuide',
    'noModelData',
    'unrecordedModel',
    'metricTotal',
    'metricInput',
    'metricOutput',
    'metricCacheCreation',
    'metricCacheRead',
    'metricReasoning',
    'metricOther',
] as const;

const usageFunctionSamples = {
    activeBucketsHint: { count: 3 },
    avgPerReport: { tokens: '1K' },
    tokenMixSubtitle: { total: '5K' },
    trendSubtitle: { buckets: 7, active: 3 },
    bucketDetail: { reports: 2, input: '1K', output: '500' },
    modelSubtitle: { count: 4 },
    modelShare: { share: '25%' },
    modelRecords: { count: 6 },
    modelAverage: { tokens: '900' },
} as const;

const machineKeys = [
    'stopDaemonTitle',
    'stopDaemonMessage',
    'daemonStopped',
    'stopDaemonFailed',
    'renameTitle',
    'renameMessage',
    'renamePlaceholder',
    'renameSuccess',
    'renameFailed',
    'previousSessions',
] as const;

const sessionInfoKeys = [
    'resumeSession',
    'resumeSessionSubtitle',
    'resumeSessionSameMachineOnly',
    'resumeSessionMachineOffline',
    'resumeSessionNeedsAgentHubAgent',
    'resumeSessionMissingMachine',
    'resumeSessionMissingBackendId',
    'resumeSessionUnexpectedDirectoryPrompt',
] as const;

describe('dynamic populated locale boundary', () => {
    it('does not ship English usage copy in the seven non-English fallback-prone locales', () => {
        for (const [locale, dictionary] of Object.entries(localizedDictionaries)) {
            for (const key of usageStringKeys) {
                if (legitimateIdenticalUsageTerms[locale as keyof typeof localizedDictionaries]?.includes(key)) continue;
                expect(dictionary.usage[key], `${locale}:usage.${key}`).not.toBe(defaults.usage[key]);
            }

            for (const [key, sample] of Object.entries(usageFunctionSamples)) {
                const english = (defaults.usage as any)[key](sample);
                const localized = (dictionary.usage as any)[key](sample);
                expect(localized, `${locale}:usage.${key}`).not.toBe(english);
            }
        }
    });

    it('localizes populated machine actions and destructive confirmations', () => {
        for (const [locale, dictionary] of Object.entries(localizedDictionaries)) {
            for (const key of machineKeys) {
                expect(dictionary.machine[key], `${locale}:machine.${key}`).not.toBe(defaults.machine[key]);
            }
        }
    });

    it('localizes every resume eligibility and recovery state', () => {
        for (const [locale, dictionary] of Object.entries(localizedDictionaries)) {
            for (const key of sessionInfoKeys) {
                expect(dictionary.sessionInfo[key], `${locale}:sessionInfo.${key}`).not.toBe(defaults.sessionInfo[key]);
            }
        }
    });

    it('exposes populated session info as one named main region', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/app/(app)/session/[id]/info.tsx'),
            'utf8',
        );

        expect(source).toContain('<ItemList role="main">');
        expect(source).toContain('<ScreenReaderHeading title={sessionName} />');
        expect(source.match(/<View role="main"/g)?.length).toBeGreaterThanOrEqual(2);
        expect(source).toContain("<ScreenReaderHeading title={t('common.loading')} />");
        expect(source).toContain("<ScreenReaderHeading title={t('errors.sessionDeleted')} />");
        expect(source).toContain("color: sessionStatus.state === 'disconnected' ? theme.colors.textSecondary : sessionStatus.isConnected ? theme.colors.success : sessionStatus.statusColor");
        expect(source).toContain("color={sessionStatus.state === 'disconnected' ? theme.colors.textSecondary : sessionStatus.statusDotColor}");
        expect(source).toContain("accessibilityLabel={t('sessionInfo.agentState')}");
        expect(source).toContain("accessibilityLabel={t('sessionInfo.metadata')}");
        expect(source).toContain("accessibilityLabel={t('sessionInfo.connectionStatus')}");
        expect(source).toContain("accessibilityLabel={`${sessionName} · ${t('sessionInfo.metadata')}`}");
    });

    it('lets a named code surface provide keyboard access without changing unnamed consumers', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), 'sources/components/CodeView.tsx'),
            'utf8',
        );

        expect(source).toContain('accessibilityLabel?: string;');
        expect(source).toContain('accessibilityLabel={accessibilityLabel}');
    });
});
