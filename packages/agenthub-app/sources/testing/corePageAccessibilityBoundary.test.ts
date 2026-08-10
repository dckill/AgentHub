import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('authenticated core page accessibility boundary', () => {
    it('keeps the settings page semantic without a decorative banner', () => {
        const settings = read('components/SettingsView.tsx');

        expect(settings).not.toContain('agenthub-settings-banner');
        expect(settings).toContain('role="main"');
        expect(settings).toContain('role="heading"');
        expect(settings).toContain('aria-level={1}');
    });

    it('keeps every New Session control at a physical 44-point minimum after UI scaling', () => {
        const screen = read('app/(app)/new/index.tsx');
        const header = read('components/navigation/Header.tsx');
        const sidebar = read('components/SidebarView.tsx');

        expect(screen).toContain('const MINIMUM_TAP_TARGET = 44;');
        expect(screen).toContain('role="main"');
        expect(screen).toContain('Math.max(MINIMUM_TAP_TARGET + 2, s(COMPOSER_SEND_BUTTON_SIZE))');
        expect(screen).toContain('Math.max(11, s(COMPOSER_INPUT_VERTICAL_PADDING))');
        expect(screen).toContain('<Text role="heading" aria-level={1} style={styles.screenReaderHeading}>');
        expect(screen).toMatch(/collapseToggle:\s*\{[\s\S]{0,180}minWidth: MINIMUM_TAP_TARGET,[\s\S]{0,80}minHeight: MINIMUM_TAP_TARGET,/);
        expect(screen).toMatch(/setupChip:\s*\{[\s\S]{0,100}minHeight: MINIMUM_TAP_TARGET,/);
        expect(screen).toMatch(/advancedHeader:\s*\{[\s\S]{0,100}minHeight: MINIMUM_TAP_TARGET,/);
        expect(screen).toMatch(/advancedPill:\s*\{[\s\S]{0,100}minHeight: MINIMUM_TAP_TARGET,/);
        expect(screen).toMatch(/collapsedRow:\s*\{[\s\S]{0,180}minHeight: MINIMUM_TAP_TARGET,/);
        expect(screen).toMatch(/collapsedIconButton:\s*\{[\s\S]{0,120}width: MINIMUM_TAP_TARGET,[\s\S]{0,80}height: MINIMUM_TAP_TARGET,/);
        expect(screen).not.toContain('width: s(34), height: s(28)');
        expect(screen).toContain('minHeight: Math.max(MINIMUM_TAP_TARGET, s(42))');
        expect(screen).toMatch(/setupSubtitle[\s\S]{0,260}numberOfLines=\{2\}/);
        expect(screen).not.toMatch(/<ScrollView\s+horizontal[\s\S]{0,300}styles\.advancedPillRow/);
        expect(screen).toMatch(/advancedPillRow:\s*\{[\s\S]{0,160}flexWrap: 'wrap',/);
        expect(screen).toMatch(/advancedPillText[\s\S]{0,260}numberOfLines=\{2\}/);
        expect(screen).toMatch(/searchInput:\s*\{[\s\S]{0,100}minHeight: MINIMUM_TAP_TARGET,/);
        expect(header).toMatch(/backButton:\s*\{[\s\S]{0,120}width: 44,[\s\S]{0,80}height: 44,/);
        expect(header).toContain('role="banner"');
        expect(sidebar).toContain('role="navigation"');
        expect(sidebar).toContain("accessibilityLabel={t('tabs.sessions')}");
    });

    it('exposes every phone Sessions state through one main region and localized heading', () => {
        const sessions = read('components/SessionsListWrapper.tsx');

        expect(sessions).toContain('role="main"');
        expect(sessions).toContain('role="heading"');
        expect(sessions).toContain('aria-level={1}');
        expect(sessions).toContain("{t('tabs.sessions')}");
    });

    it('lets audited Settings subtitles wrap instead of truncating long locales', () => {
        const settings = read('components/SettingsView.tsx');
        const item = read('components/Item.tsx');
        const subtitleItems = settings.match(/<Item[\s\S]*?subtitle=\{[\s\S]*?\/>/g) ?? [];

        expect(subtitleItems.length).toBeGreaterThanOrEqual(6);
        for (const item of subtitleItems) {
            expect(item).toContain('subtitleLines={0}');
            expect(item).toContain('titleLines={0}');
        }
        expect(item).toContain('titleLines?: number');
        expect(item).toContain('const effectiveTitleLines = titleLines !== undefined');
    });

    it('keeps picker options named and removes click-away surfaces from Tab order', () => {
        const screen = read('app/(app)/new/index.tsx');

        expect(screen).toContain('accessibilityRole="radio"');
        expect(screen).toContain('accessibilityState={{ checked: isSelected }}');
        expect(screen).toContain('aria-checked={isSelected}');
        expect(screen).toMatch(/Click-away backdrop[\s\S]{0,500}accessible=\{false\}[\s\S]{0,160}tabIndex=\{-1\}/);
    });

    it('exposes the Devices page as the document main region with a level-one heading', () => {
        const devices = read('components/MachinesView.tsx');

        expect(devices).toContain('role="main"');
        expect(devices).toContain('role="heading" aria-level={1}');
        expect(devices).toContain("{t('tabs.machines')}");
    });
});
