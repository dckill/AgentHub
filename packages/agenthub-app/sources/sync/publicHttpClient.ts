import { getAgentHubClientId } from './apiSocket';
import { createPublicHttpClient } from './httpClient';
import { getServerUrl } from './serverConfig';

export const publicHttpClient = createPublicHttpClient({
    getBaseUrl: getServerUrl,
    getClientId: getAgentHubClientId,
});
