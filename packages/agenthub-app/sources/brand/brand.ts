export const agentHubBrand = {
    productName: 'AgentHub',
    shortName: 'AgentHub',
    displayName: {
        development: 'AgentHub (dev)',
        preview: 'AgentHub (preview)',
        production: 'AgentHub',
    },
    tagline: 'Amber Crystal agent workspace',
    scheme: 'agenthub',
    slug: 'agenthub',
    bundleId: {
        development: 'com.artsum.agenthub.dev',
        preview: 'com.artsum.agenthub.preview',
        production: 'com.artsum.agenthub',
    },
} as const;

export type AgentHubAppVariant = keyof typeof agentHubBrand.displayName;

export function getAgentHubAppVariant(value: string | undefined): AgentHubAppVariant {
    if (value === 'preview' || value === 'production') {
        return value;
    }
    return 'development';
}
