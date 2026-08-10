import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { decodeBase64 } from '@/api/encryption';
import { configuration } from '@/configuration';
import { deriveContentKeyPair } from '@/utils/contentKeyPair';

const AgentCredentialsSchema = z.object({
    token: z.string().min(1),
    secret: z.string().min(1),
});

export type LocalAgentHubAgentCredentials = {
    token: string;
    secret: Uint8Array;
    contentKeyPair: {
        publicKey: Uint8Array;
        secretKey: Uint8Array;
    };
};

export type ResumeSupport = {
    rpcAvailable: boolean;
    requiresSameMachine: true;
    requiresAgentHubAgentAuth: true;
    agenthubAgentAuthenticated: boolean;
    detectedAt: number;
};

export function getLocalAgentHubAgentCredentialPath(agentHubHomeDir: string = configuration.agentHubHomeDir): string {
    return join(agentHubHomeDir, 'agent.key');
}

export function readLocalAgentHubAgentCredentials(
    agentHubHomeDir: string = configuration.agentHubHomeDir,
): LocalAgentHubAgentCredentials | null {
    const credentialPath = getLocalAgentHubAgentCredentialPath(agentHubHomeDir);
    if (!existsSync(credentialPath)) {
        return null;
    }

    try {
        const parsed = AgentCredentialsSchema.parse(JSON.parse(readFileSync(credentialPath, 'utf8')));
        const secret = decodeBase64(parsed.secret);
        return {
            token: parsed.token,
            secret,
            contentKeyPair: deriveContentKeyPair(secret),
        };
    } catch {
        return null;
    }
}

export function hasLocalAgentHubAgentAuth(agentHubHomeDir: string = configuration.agentHubHomeDir): boolean {
    return readLocalAgentHubAgentCredentials(agentHubHomeDir) !== null;
}

export function detectResumeSupport(agentHubHomeDir: string = configuration.agentHubHomeDir): ResumeSupport {
    const agenthubAgentAuthenticated = hasLocalAgentHubAgentAuth(agentHubHomeDir);
    return {
        rpcAvailable: agenthubAgentAuthenticated,
        requiresSameMachine: true,
        requiresAgentHubAgentAuth: true,
        agenthubAgentAuthenticated,
        detectedAt: Date.now(),
    };
}
