import type { IntegrationEnvironment } from './integrationEnvironment';

declare global {
    // eslint-disable-next-line no-var
    var __agenthubIntegrationEnv: IntegrationEnvironment | undefined;
}

export function getIntegrationEnv(): IntegrationEnvironment {
    if (!globalThis.__agenthubIntegrationEnv) {
        throw new Error('No active integration environment');
    }

    return globalThis.__agenthubIntegrationEnv;
}
