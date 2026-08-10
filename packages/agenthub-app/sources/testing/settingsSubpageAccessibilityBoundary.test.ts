import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');
const withoutJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('authenticated settings subpage accessibility boundary', () => {
    it('requires every shared Switch to be named and expose a 44-point target', () => {
        const sharedSwitch = read('components/Switch.tsx');
        const consumers = [
            'app/(app)/settings/appearance.tsx',
            'app/(app)/settings/features.tsx',
            'app/(app)/dev/index.tsx',
            'app/(app)/dev/list-demo.tsx',
            'app/(app)/dev/unistyles-demo.tsx',
        ];

        expect(sharedSwitch).toContain("accessibilityLabel: string");
        expect(sharedSwitch).toContain('minWidth: 44');
        expect(sharedSwitch).toContain('minHeight: 44');

        for (const file of consumers) {
            const source = withoutJsxComments(read(file));
            const switches = source.match(/<Switch[\s\S]*?\/>/g) ?? [];
            expect(switches.length, `${file} should keep at least one active Switch`).toBeGreaterThan(0);
            for (const usage of switches) {
                expect(usage, `${file} contains an unnamed Switch`).toContain('accessibilityLabel=');
            }
        }
    });

    it('uses radio semantics and 44-point options for the shared segmented control', () => {
        const segmented = read('components/glass/SegmentedControl.tsx');

        expect(segmented).toContain('role="radiogroup"');
        expect(segmented).toContain('accessibilityRole="radio"');
        expect(segmented).toContain('aria-checked={selected}');
        expect(segmented).toMatch(/option:\s*\{[\s\S]{0,160}minHeight: 44,/);
    });

    it('uses the shared semantic page boundary on the audited settings routes', () => {
        const page = read('components/SettingsPage.tsx');
        const routes = [
            ['-settings/AccountSettingsView.tsx', "t('settings.account')"],
            ['app/(app)/settings/appearance.tsx', "t('settings.appearance')"],
            ['app/(app)/settings/features.tsx', "t('settings.featuresTitle')"],
            ['app/(app)/settings/credentials.tsx', "t('credentials.title')"],
            ['app/(app)/settings/credentials/edit.tsx', "isEditing ? t('credentials.editCredential') : t('credentials.addCredential')"],
        ] as const;

        expect(page).toContain('role="main"');
        expect(page).toContain('role="heading"');
        expect(page).toContain('aria-level={1}');

        for (const [file, title] of routes) {
            const source = read(file);
            expect(source).toContain('<SettingsPage');
            expect(source).toContain(`title={${title}}`);
        }
    });

    it('names every credential field and keeps its physical input height at 44 points', () => {
        const edit = read('app/(app)/settings/credentials/edit.tsx');
        const inputs = edit.match(/<TextInput[\s\S]*?\/>/g) ?? [];

        expect(inputs.length).toBeGreaterThanOrEqual(4);
        for (const input of inputs) {
            expect(input).toContain('accessibilityLabel=');
        }
        expect(edit).toMatch(/input:\s*\{[\s\S]{0,120}minHeight: 44,/);
    });

    it('moves the long current-language value below its title on narrow screens', () => {
        const appearance = read('app/(app)/settings/appearance.tsx');
        const languageItemStart = appearance.indexOf("title={t('settingsLanguage.currentLanguage')}");
        const languageItem = languageItemStart >= 0 ? appearance.slice(languageItemStart, languageItemStart + 700) : '';

        expect(languageItem).toContain('subtitle={getLanguageDisplayText()}');
        expect(languageItem).toContain('subtitleLines={0}');
        expect(languageItem).not.toContain('detail={getLanguageDisplayText()}');
    });

    it('allows every descriptive Appearance and Features row to reflow in long locales', () => {
        for (const file of [
            'app/(app)/settings/appearance.tsx',
            'app/(app)/settings/features.tsx',
        ]) {
            const source = withoutJsxComments(read(file));
            const descriptiveItems = source.match(/<Item\s[\s\S]*?subtitle=\{[\s\S]*?\/>/g) ?? [];

            expect(descriptiveItems.length, file).toBeGreaterThanOrEqual(4);
            for (const item of descriptiveItems) {
                expect(item, `${file} truncates a localized title`).toContain('titleLines={0}');
                expect(item, `${file} truncates a localized subtitle`).toContain('subtitleLines={0}');
            }
        }
    });

    it('allows every Developer Tools description to reflow in long locales', () => {
        const source = withoutJsxComments(read('app/(app)/dev/index.tsx'));
        const subtitleCount = (source.match(/subtitle=\{/g) ?? []).length;
        const titleWrapCount = (source.match(/(^|\s)titleLines=\{0\}/g) ?? []).length;
        const subtitleWrapCount = (source.match(/(^|\s)subtitleLines=\{0\}/g) ?? []).length;

        expect(subtitleCount).toBeGreaterThanOrEqual(10);
        expect(titleWrapCount).toBe(subtitleCount);
        expect(subtitleWrapCount).toBe(subtitleCount);
    });

    it('stacks every Appearance scale value below its title for narrow long locales', () => {
        const appearance = withoutJsxComments(read('app/(app)/settings/appearance.tsx'));
        const scaleKeys = [
            'sessionScale',
            'chatScale',
            'fileScale',
            'fileListScale',
            'deviceScale',
            'settingsScale',
        ];

        for (const key of scaleKeys) {
            const itemStart = appearance.indexOf(`title={t('settingsAppearance.${key}')}`);
            const item = itemStart >= 0 ? appearance.slice(itemStart, itemStart + 360) : '';

            expect(item, `${key} is missing`).toContain(`subtitle={getScaleLabel(`);
            expect(item, `${key} still competes with a trailing detail`).not.toContain('detail={getScaleLabel(');
            expect(item, `${key} truncates a localized title`).toContain('titleLines={0}');
            expect(item, `${key} truncates its current value`).toContain('subtitleLines={0}');
        }
    });

    it('registers visible localized headers for both credential routes', () => {
        const layout = read('app/(app)/_layout.tsx');

        expect(layout).toMatch(/name="settings\/credentials"[\s\S]{0,180}headerTitle: t\('credentials\.title'\)/);
        expect(layout).toMatch(/name="settings\/credentials\/edit"[\s\S]{0,220}headerTitle: t\('credentials\.addCredential'\)/);
    });
});
