import { afterAll } from 'vitest';
import {
    applyEnvironmentToProcess,
    createIntegrationEnvironment,
    destroyIntegrationEnvironment,
    type EnvironmentTemplate,
    type IntegrationEnvironment,
} from './integrationEnvironment';
import { registerIntegrationEnvironment } from './integrationEnvironmentRegistry';

type IntegrationEnvironmentProfile = {
    template: EnvironmentTemplate;
    up: boolean;
    web?: boolean;
};

declare global {
    // eslint-disable-next-line no-var
    var __agenthubIntegrationEnv: IntegrationEnvironment | undefined;
}

export async function installIntegrationEnvironment(profile: IntegrationEnvironmentProfile) {
    const previousEnv = {
        AGENTHUB_SERVER_URL: process.env.AGENTHUB_SERVER_URL,
        AGENTHUB_HOME_DIR: process.env.AGENTHUB_HOME_DIR,
        AGENTHUB_CLI_ROOT: process.env.AGENTHUB_CLI_ROOT,
        AGENTHUB_PROJECT_DIR: process.env.AGENTHUB_PROJECT_DIR,
        AGENTHUB_VARIANT: process.env.AGENTHUB_VARIANT,
        DEBUG: process.env.DEBUG,
    };

    const env = await createIntegrationEnvironment(profile);
    const cleanupManifestPath = process.env.AGENTHUB_INTEGRATION_CLEANUP_MANIFEST;
    if (!cleanupManifestPath) {
        await destroyIntegrationEnvironment(env);
        throw new Error('AGENTHUB_INTEGRATION_CLEANUP_MANIFEST is required for integration environments');
    }
    registerIntegrationEnvironment(cleanupManifestPath, env.name);
    applyEnvironmentToProcess(env);
    globalThis.__agenthubIntegrationEnv = env;

    afterAll(async () => {
        try {
            await destroyIntegrationEnvironment(env);
        } finally {
            for (const [key, value] of Object.entries(previousEnv)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }

            if (globalThis.__agenthubIntegrationEnv?.name === env.name) {
                globalThis.__agenthubIntegrationEnv = undefined;
            }
        }
    });
}
