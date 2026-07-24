import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const components = path.resolve(__dirname, '../components');
const read = (name: string) => fs.readFileSync(path.join(components, name), 'utf8');

describe('authenticated home experience boundary', () => {
    it('uses the right pane overview as the only desktop primary session CTA', () => {
        const sidebar = read('SidebarView.tsx');
        const emptySidebar = read('EmptySessionsTablet.tsx');
        const main = read('MainView.tsx');
        const overview = read('HomeOverview.tsx');

        expect(sidebar).not.toContain("import { FABWide }");
        expect(sidebar).not.toContain("t('newSession.title')");
        expect(emptySidebar).not.toContain("router.navigate('/new')");
        expect(emptySidebar).not.toContain("emptySessionsTablet.startNewSession");
        expect(main).toContain('return <HomeOverview />');
        expect(overview.match(/t\('newSession\.title'\)/g)).toHaveLength(1);
    });

    it('exposes loading and connectivity changes as named live status regions', () => {
        const main = read('MainView.tsx');
        const sessions = read('SessionsListWrapper.tsx');
        const overview = read('HomeOverview.tsx');

        for (const source of [main, sessions, overview]) {
            expect(source).toContain('role="status"');
            expect(source).toContain('accessibilityLiveRegion="polite"');
        }
        expect(sessions).toContain("t('homeOverview.loading')");
        expect(overview).toContain("model.state === 'offline'");
        expect(overview).toContain("model.state === 'empty'");
        expect(overview).toContain("model.state === 'no-online-devices'");
    });

    it('keeps every dashboard action named and at least 44 points high', () => {
        const overview = read('HomeOverview.tsx');
        const themeCss = fs.readFileSync(path.resolve(__dirname, '../theme.css'), 'utf8');

        expect(overview).toContain('accessibilityRole="button"');
        expect(overview).toContain('accessibilityLabel={newSessionLabel}');
        expect(overview).toContain('minHeight: 44');
        expect(overview).not.toContain("outlineStyle: 'none'");
        expect(themeCss).toContain(':focus-visible');
    });

    it('keeps the full desktop home surface axe-safe for names, roles and light-theme contrast', () => {
        const sidebar = read('SidebarView.tsx');
        const overview = read('HomeOverview.tsx');
        const sessions = read('ActiveSessionsGroupCompact.tsx');

        expect(sidebar).not.toContain('accessibilityRole="image"');
        expect(sidebar).toContain('accessibilityLabel="AgentHub"');
        expect(sidebar).toContain('textColor: theme.colors.textSecondary');

        expect(sessions).toMatch(/accessibilityLabel=\{t\('project\.actions'\)\}[\s\S]{0,120}accessibilityRole="button"/);
        expect(sessions).toMatch(/accessibilityLabel=\{t\('sessionInfo\.quickActions'\)\}[\s\S]{0,120}accessibilityRole="button"/);
        expect(sessions).toContain("accessibilityLabel={t('project.editTitle')}");
        expect(sessions).toContain('accessibilityLabel={session.name}');
        expect(sessions).toContain('styles.sessionPrimaryAction');
        expect(sessions).toContain('theme.dark ? theme.colors.gitAddedText : theme.colors.diff.inlineAddedText');

        expect(overview).toContain('theme.dark ? theme.colors.status.connected : theme.colors.diff.inlineAddedText');
    });

    it('keeps populated home actions at least 44 points in the narrow Web layout', () => {
        const sessions = read('ActiveSessionsGroupCompact.tsx');

        expect(sessions).toMatch(/addButton:\s*\{[\s\S]{0,120}width: 44,[\s\S]{0,80}height: 44,/);
        expect(sessions).toMatch(/machineSeparatorToggle:\s*\{[\s\S]{0,180}minHeight: 44,/);
        expect(sessions).toMatch(/machineSeparatorTrailingToggle:\s*\{[\s\S]{0,120}minHeight: 44,/);
        expect(sessions).toMatch(/machineSeparatorDetailButton:\s*\{[\s\S]{0,120}width: 44,[\s\S]{0,80}height: 44,/);
        expect(sessions).toMatch(/sessionPrimaryAction:\s*\{[\s\S]{0,180}minHeight: 44,/);
        expect(sessions).toMatch(/infoButton:\s*\{[\s\S]{0,120}width: 44,[\s\S]{0,80}height: 44,/);
        expect(sessions).toContain('style={[styles.officialSectionHeader, { minHeight: s(44), paddingHorizontal: s(16) }]}');
    });

    it('gives the mobile header and bottom tabs valid Web accessibility semantics', () => {
        const header = read('HomeHeader.tsx');
        const headerLogo = read('HeaderLogo.tsx');
        const main = read('MainView.tsx');
        const tabBar = read('TabBar.tsx');

        expect(tabBar).toMatch(/<View\s+accessibilityRole="tablist"\s+style=\{styles\.innerContainer\}>/);
        expect(header).toContain('accessibilityLabel="AgentHub"');
        expect(header).toContain('role="status"');
        expect(header).toContain('textColor: theme.colors.textSecondary');
        expect(headerLogo).toContain('accessibilityLabel="AgentHub"');
        expect(main).toContain('role="status"');
        expect(main).toContain('{ color: theme.colors.textSecondary }');
    });

    it('keeps the mobile bottom tabs evenly distributed', () => {
        const tabBar = read('TabBar.tsx');

        expect(tabBar).toMatch(/innerContainer:\s*\{[\s\S]{0,180}justifyContent: 'space-around'/);
        expect(tabBar).toMatch(/tab:\s*\{[\s\S]{0,80}flex: 1,/);
        expect(tabBar).not.toContain("justifyContent: 'flex-start'");
    });
});
