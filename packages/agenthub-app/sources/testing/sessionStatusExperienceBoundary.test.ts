import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(sources, relativePath), 'utf8');

describe('session status experience boundary', () => {
    it('renders the status bar above or below the composer from a user setting', () => {
        const view = read('-session/SessionView.tsx');
        expect(view).toContain("useSetting('sessionStatusBarDisplay')");
        expect(view).toContain("sessionStatusBarDisplay === 'above'");
        expect(view).toContain("sessionStatusBarDisplay === 'below'");
        expect(view).toContain('usageLimits={session.agentState?.usageLimits}');
    });

    it('makes every interactive status chip keyboard and screen-reader accessible', () => {
        const bar = read('components/SessionStatusBar.tsx');
        expect(bar).toContain('accessibilityRole="button"');
        expect(bar).toContain('accessibilityState={{ expanded: props.active }}');
        expect(bar).toContain('accessibilityRole="radio"');
        expect(bar).toContain('accessibilityState={{ selected: isSelected }}');
        expect(bar).toContain('getSpaceKeyActivationProps');
    });

    it('does not render a guessed context circle before a real context window arrives', () => {
        const bar = read('components/SessionStatusBar.tsx');
        expect(bar).not.toContain('SESSION_STATUS_CONTEXT_MAX');
        expect(bar).toContain('contextMax !== null');
    });

    it('offers visibility and remaining-quota controls in appearance settings', () => {
        const appearance = read("app/(app)/settings/appearance.tsx");
        expect(appearance).toContain("useSettingMutable('sessionStatusBarDisplay')");
        expect(appearance).toContain("useSettingMutable('usageLimitShowRemaining')");
    });
});
