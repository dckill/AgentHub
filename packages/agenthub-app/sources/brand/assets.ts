export const agentHubBrandAssets = {
    icon: './sources/assets/images/agenthub-icon.png',
    adaptiveIcon: './sources/assets/images/agenthub-icon-adaptive.png',
    monochromeIcon: './sources/assets/images/agenthub-icon-monochrome.png',
    notificationIcon: './sources/assets/images/agenthub-icon-notification.png',
    favicon: './sources/assets/images/agenthub-favicon.png',
    splash: './sources/assets/images/agenthub-icon.png',
    runtimePath: {
        headerLogoDark: 'agenthub-logo-dark.png',
        headerLogoLight: 'agenthub-logo-light.png',
        logotypeDark: 'agenthub-logotype-dark.png',
        logotypeLight: 'agenthub-logotype-light.png',
        defaultAvatar: 'agenthub-avatar.png',
    },
} as const;

export type AgentHubBrandAssets = typeof agentHubBrandAssets;
