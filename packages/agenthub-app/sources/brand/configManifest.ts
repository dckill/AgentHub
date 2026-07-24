import { agentHubBrand } from './brand';

export const agentHubConfigManifest = {
    expo: {
        slug: agentHubBrand.slug,
        scheme: agentHubBrand.scheme,
        version: '1.0.0',
        runtimeVersion: '1',
        variants: {
            development: {
                name: agentHubBrand.displayName.development,
                bundleIdentifier: agentHubBrand.bundleId.development,
            },
            preview: {
                name: agentHubBrand.displayName.preview,
                bundleIdentifier: agentHubBrand.bundleId.preview,
            },
            production: {
                name: agentHubBrand.displayName.production,
                bundleIdentifier: agentHubBrand.bundleId.production,
            },
        },
    },
    androidProduction: {
        appName: agentHubBrand.displayName.production,
        applicationId: agentHubBrand.bundleId.production,
        namespace: agentHubBrand.bundleId.production,
        versionName: '1.0.0',
    },
    tauri: {
        production: {
            productName: agentHubBrand.displayName.production,
            identifier: agentHubBrand.bundleId.production,
            title: agentHubBrand.displayName.production,
            version: '1.0.0',
        },
        preview: {
            productName: agentHubBrand.displayName.preview,
            identifier: agentHubBrand.bundleId.preview,
            title: agentHubBrand.displayName.preview,
        },
        development: {
            productName: agentHubBrand.displayName.development,
            identifier: agentHubBrand.bundleId.development,
            title: agentHubBrand.displayName.development,
        },
    },
} as const;

export type AgentHubConfigManifest = typeof agentHubConfigManifest;
