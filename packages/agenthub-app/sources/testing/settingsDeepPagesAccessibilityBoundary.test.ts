import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('deep settings page accessibility boundary', () => {
    it('uses the shared semantic page boundary for language, usage, and every scale route', () => {
        const routes = [
            ['app/(app)/settings/language.tsx', "t('settingsLanguage.currentLanguage')"],
            ['app/(app)/settings/usage.tsx', "t('settings.usage')"],
        ] as const;

        for (const [file, title] of routes) {
            const source = read(file);
            expect(source).toContain('<SettingsPage');
            expect(source).toContain(`title={${title}}`);
        }

        const scaleRoutes = [
            ['session-scale', 'sessionScale'],
            ['chat-scale', 'chatScale'],
            ['file-scale', 'fileScale'],
            ['file-list-scale', 'fileListScale'],
            ['device-scale', 'deviceScale'],
            ['settings-scale', 'settingsScale'],
        ] as const;

        for (const [route, titleKey] of scaleRoutes) {
            const source = read(`app/(app)/settings/${route}.tsx`);
            expect(source).toContain('<ScaleSettingsPage');
            expect(source).toContain(`title={t('settingsAppearance.${titleKey}')}`);
            expect(source).not.toContain('<ItemList');
            expect(source).not.toContain('<ScaleSlider');
        }
    });

    it('exposes language and scale choices as named checked radio groups', () => {
        const language = read('app/(app)/settings/language.tsx');
        const selectRow = read('components/SelectRow.tsx');
        const scale = read('components/ScaleSlider.tsx');

        expect(language).toContain('role="radiogroup"');
        expect(language).toContain('<SelectRow');
        expect(language).toContain('selected={currentSelection === option.key}');
        expect(language).toContain('subtitleLines={0}');

        expect(selectRow).toContain('accessibilityRole="radio"');
        expect(selectRow).toContain('aria-checked={selected}');
        expect(selectRow).toContain('accessibilityState={{ checked: selected }}');

        expect(scale).toContain('accessibilityLabel: string');
        expect(scale).toContain('role="radiogroup"');
        expect(scale).toContain('accessibilityRole="radio"');
        expect(scale).toContain('aria-checked={isSelected}');
        expect(scale).toContain('accessibilityState={{ checked: isSelected }}');
        expect(scale).toMatch(/button:\s*\{[\s\S]{0,180}minWidth: 44,[\s\S]{0,80}minHeight: 44,/);
    });

    it('keeps usage selectors operable, stateful, announced, and locale-aware', () => {
        const usage = read('components/usage/UsagePanel.tsx');

        expect(usage.match(/role="radiogroup"/g)).toHaveLength(2);
        expect(usage.match(/accessibilityRole="radio"/g)).toHaveLength(2);
        expect(usage.match(/aria-checked=/g)).toHaveLength(2);
        expect(usage).toMatch(/periodButton:\s*\{[\s\S]{0,180}minHeight: 44,/);
        expect(usage).toMatch(/infoButton:\s*\{[\s\S]{0,120}width: 44,[\s\S]{0,80}height: 44,/);
        expect(usage).toContain('accessibilityLiveRegion="polite"');
        expect(usage).toContain('role="status"');
        expect(usage).toContain('getCurrentLanguage()');
        expect(usage).not.toContain("toLocaleTimeString('zh-CN'");
        expect(usage).not.toContain("toLocaleDateString('zh-CN'");
    });

    it('registers localized visible headers for language and usage', () => {
        const layout = read('app/(app)/_layout.tsx');

        expect(layout).toMatch(/name="settings\/language"[\s\S]{0,180}headerTitle: t\('settingsLanguage\.currentLanguage'\)/);
        expect(layout).toMatch(/name="settings\/usage"[\s\S]{0,180}headerTitle: t\('settings\.usage'\)/);
    });
});
