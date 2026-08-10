import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = join(__dirname, '..');

describe('MachinesView operational and action boundaries', () => {
    it('derives page states from data readiness and socket status', () => {
        const source = readFileSync(join(sources, 'components/MachinesView.tsx'), 'utf8');
        expect(source).toContain('useIsDataReady');
        expect(source).toContain('useSocketStatus');
        expect(source).toContain('buildMachinesViewModel');
        expect(source).toContain('accessibilityLiveRegion="polite"');
        expect(source).toContain("t('homeOverview.connectionSettings')");
        expect(source).toContain("pageModel.state !== 'offline' && isMachineOnline(machine)");
        expect(source).toContain('viewportWidth < 480');
        expect(source).toContain("flexDirection: 'column'");
    });

    it('keeps top, device and group actions named and at least 44 points', () => {
        const view = readFileSync(join(sources, 'components/MachinesView.tsx'), 'utf8');
        const route = readFileSync(join(sources, 'app/(app)/machines/index.tsx'), 'utf8');
        const transfer = readFileSync(join(sources, 'components/FileTransferBadge.tsx'), 'utf8');

        expect(view).toContain("getAccessibleActionProps(t('machines.deviceActions')");
        expect(view).toContain("getAccessibleActionProps(t('machines.groupActions')");
        expect(view).toContain('minWidth: 44');
        expect(view).toContain('minHeight: 44');
        expect(route).toContain("accessibilityLabel={t('common.fileTransfers')}");
        expect(transfer).toContain('width: 44');
        expect(transfer).toContain('height: 44');
    });

    it('renders the dashboard new-session action as a text-only button', () => {
        const view = readFileSync(join(sources, 'components/MachinesView.tsx'), 'utf8');

        expect(view).toMatch(/dashboardAction:\s*\{[\s\S]{0,160}minHeight: 44,[\s\S]{0,120}borderWidth: 1,/);
        expect(view).toMatch(/dashboardActionText:\s*\{[\s\S]{0,120}fontSize: 13,/);
        expect(view).toContain("<Text style={styles.dashboardActionText}>{t('newSession.title')}</Text>");
        expect(view).not.toContain('dashboardActionIconFrame');
        expect(view).not.toContain('dashboardActionIconHighlight');
        expect(view).not.toContain('dashboardActionIconSecondaryHighlight');
        expect(view).not.toContain('<Ionicons name="chatbubbles-outline"');
        expect(view).not.toContain('dashboardActionVisuals');
    });

    it('guards asynchronous group prompts before projecting account settings', () => {
        const view = readFileSync(join(sources, 'components/MachinesView.tsx'), 'utf8');

        expect(view).toContain("import { sync } from '@/sync/sync';");
        expect(view).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(view).toContain('const generation = sync.getAccountGeneration();');
        expect(view).toContain('runSessionActionRequest({');
    });
});
