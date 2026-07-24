import { describe, expect, it } from 'vitest';
import { en } from './translations/en';
import { zhHans } from './translations/zh-Hans';
import { zhHant } from './translations/zh-Hant';

const legacyCliName = `${['Ha', 'ppy'].join('')} CLI`;

describe('AgentHub visible branding', () => {
    it('uses AgentHub branding in the English device and session onboarding copy', () => {
        expect(en.machines.noDevicesSubtitle).toContain('AgentHub CLI');
        expect(en.machines.noDevicesSubtitle).not.toContain(legacyCliName);
        expect(en.components.emptyMainScreen.installCli).toContain('AgentHub CLI');
        expect(en.server.notValidAgentHubServer).toContain('AgentHub Server');
        expect(en.sessionInfo.agentHubSessionId).toBe('AgentHub Session ID');
    });

    it('uses AgentHub branding in Simplified Chinese user-visible copy', () => {
        expect(zhHans.machines.noDevicesSubtitle).toContain('AgentHub CLI');
        expect(zhHans.machines.noDevicesSubtitle).not.toContain(legacyCliName);
        expect(zhHans.components.emptyMainScreen.installCli).toContain('AgentHub CLI');
        expect(zhHans.server.notValidAgentHubServer).toContain('AgentHub 服务器');
        expect(zhHans.sessionInfo.agentHubSessionId).toBe('AgentHub 会话 ID');
    });

    it('uses AgentHub branding in Traditional Chinese user-visible copy', () => {
        expect(zhHant.machines.noDevicesSubtitle).toContain('AgentHub CLI');
        expect(zhHant.machines.noDevicesSubtitle).not.toContain(legacyCliName);
        expect(zhHant.components.emptyMainScreen.installCli).toContain('AgentHub CLI');
        expect(zhHant.server.notValidAgentHubServer).toContain('AgentHub 伺服器');
        expect(zhHant.sessionInfo.agentHubSessionId).toBe('AgentHub 工作階段 ID');
    });
});
