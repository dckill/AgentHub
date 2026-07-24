import { getAgentHubClientId } from './apiSocket';
import { getServerUrl } from './serverConfig';
import { createAuthenticatedHttpClient } from './httpClient';

export const httpClient = createAuthenticatedHttpClient({
    getBaseUrl: getServerUrl,
    getClientId: getAgentHubClientId,
});
