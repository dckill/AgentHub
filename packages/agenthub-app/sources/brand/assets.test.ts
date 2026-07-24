import { describe, expect, it } from 'vitest';
import { agentHubBrandAssets } from './assets';

describe('AgentHub brand assets', () => {
    it('maps app shell assets to AgentHub Amber Crystal files', () => {
        expect(agentHubBrandAssets.icon).toBe('./sources/assets/images/agenthub-icon.png');
        expect(agentHubBrandAssets.adaptiveIcon).toBe('./sources/assets/images/agenthub-icon-adaptive.png');
        expect(agentHubBrandAssets.monochromeIcon).toBe('./sources/assets/images/agenthub-icon-monochrome.png');
        expect(agentHubBrandAssets.notificationIcon).toBe('./sources/assets/images/agenthub-icon-notification.png');
        expect(agentHubBrandAssets.favicon).toBe('./sources/assets/images/agenthub-favicon.png');
        expect(agentHubBrandAssets.splash).toBe('./sources/assets/images/agenthub-icon.png');
    });

    it('exposes runtime image paths for header logo, logotype, and default avatar', () => {
        expect(agentHubBrandAssets.runtimePath).toEqual({
            headerLogoDark: 'agenthub-logo-dark.png',
            headerLogoLight: 'agenthub-logo-light.png',
            logotypeDark: 'agenthub-logotype-dark.png',
            logotypeLight: 'agenthub-logotype-light.png',
            defaultAvatar: 'agenthub-avatar.png',
        });
    });
});
