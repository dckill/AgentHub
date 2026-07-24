import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const previewFiles = [
    'ChatPreview.tsx',
    'DevicePreview.tsx',
    'FileListPreview.tsx',
    'FilePreview.tsx',
    'SessionListPreview.tsx',
    'SettingsPreview.tsx',
];

const previewSources = Object.fromEntries(
    previewFiles.map((file) => [
        file,
        fs.readFileSync(path.join(process.cwd(), 'sources/components/preview', file), 'utf8'),
    ]),
);

const requiredKeys = [
    'chatWorkspaceTitle',
    'chatWorkspaceSubtitle',
    'chatUserPrompt',
    'chatAgentReview',
    'chatEdit',
    'chatPlanMode',
    'chatAnalysisComplete',
    'chatRecommendation',
    'favoriteDevices',
    'developmentWorkstation',
    'buildServer',
    'fileDirectory',
    'sessionMobileClient',
    'sessionFixAuth',
    'sessionProfile',
    'sessionCache',
    'sessionApiService',
    'sessionTokenRefresh',
    'sessionRateLimit',
    'sessionApiDocs',
    'sessionCors',
    'settingsSection',
    'credentialsSaved',
] as const;

describe('Appearance preview i18n boundary', () => {
    it('does not ship Chinese-only example copy in the six production previews', () => {
        for (const [file, source] of Object.entries(previewSources)) {
            expect(source, file).not.toMatch(/[\u3400-\u9fff]/u);
        }
    });

    it('defines the preview sample namespace in the default and ten locale trees', () => {
        const translationFiles = [
            'sources/text/_default.ts',
            ...['en', 'ru', 'pl', 'es', 'it', 'pt', 'ca', 'zh-Hans', 'zh-Hant', 'ja']
                .map((locale) => `sources/text/translations/${locale}.ts`),
        ];

        for (const translationFile of translationFiles) {
            const source = fs.readFileSync(path.join(process.cwd(), translationFile), 'utf8');
            expect(source, translationFile).toContain('previewSamples: {');
            for (const key of requiredKeys) {
                expect(source, `${translationFile}:${key}`).toContain(`${key}:`);
            }
        }
    });

    it('routes every localizable preview sample through typed translations', () => {
        const combined = Object.values(previewSources).join('\n');
        for (const key of requiredKeys) {
            expect(combined, key).toContain(`t('previewSamples.${key}'`);
        }
    });

    it('uses the active language name in the settings preview', () => {
        const settingsPreview = previewSources['SettingsPreview.tsx'];
        expect(settingsPreview).toContain('getLanguageNativeName(getCurrentLanguage())');
        expect(settingsPreview).not.toContain("detail: '简体中文'");
    });
});
