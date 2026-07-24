import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(__dirname, '..');

describe('agent work collapse UI boundary', () => {
    it('uses the semantic setting in chat and appearance settings', () => {
        const chatList = fs.readFileSync(path.join(sourceRoot, 'components/ChatList.tsx'), 'utf8');
        const appearance = fs.readFileSync(path.join(sourceRoot, 'app/(app)/settings/appearance.tsx'), 'utf8');

        expect(chatList).toContain("useSetting('collapseAgentWork')");
        expect(chatList).toContain('resolveCollapsedGroupIds');
        expect(appearance).toContain("useSettingMutable('collapseAgentWork')");
        expect(appearance).toContain("t('settingsAppearance.collapseAgentWork')");
    });

    it('gives collapse headers an accessible expanded state and 44 point target', () => {
        const view = fs.readFileSync(path.join(sourceRoot, 'components/ToolGroupView.tsx'), 'utf8');

        expect(view).toContain("import { getAccessibleActionProps } from './accessibilityProps';");
        expect(view).toContain("interaction={singleToolMessage ? 'navigation' : 'disclosure'}");
        expect(view).toContain("props.interaction === 'disclosure'");
        expect(view).toContain("accessibilityRole: 'link' as const");
        expect(view).toContain("props.interaction === 'disclosure' && props.expanded ? 'chevron-down' : 'chevron-forward'");
        expect(view).toMatch(/header:\s*\{[\s\S]*?minHeight:\s*44/);
    });
});
