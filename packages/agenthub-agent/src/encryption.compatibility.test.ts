import { describe, expect, it } from 'vitest';
import {
    deriveKey as deriveAgentKey,
    deriveSecretKeyTreeRoot as deriveAgentRoot,
    deriveSecretKeyTreeChild as deriveAgentChild,
    deriveContentKeyPair as deriveAgentContentKeyPair,
} from './encryption';
import {
    deriveKey as deriveCliKey,
    deriveSecretKeyTreeRoot as deriveCliRoot,
    deriveSecretKeyTreeChild as deriveCliChild,
} from '../../agenthub-cli/src/utils/deriveKey';
import {
    encryptWithDataKey as encryptCliDataKey,
    decryptWithDataKey as decryptCliDataKey,
} from '../../agenthub-cli/src/api/encryption';
import {
    encryptWithDataKey as encryptAgentDataKey,
    decryptWithDataKey as decryptAgentDataKey,
} from './encryption';
import { deriveContentKeyPair as deriveCliContentKeyPair } from '../../agenthub-cli/src/utils/contentKeyPair';
import {
    DATA_KEY_AUTH_TAG_BYTES,
    DATA_KEY_BUNDLE_VERSION,
    DATA_KEY_HEADER_BYTES,
    DATA_KEY_NONCE_BYTES,
} from '@artsum/agenthub-wire';

const seed = new TextEncoder().encode('cross-package encryption vector');
const usage = 'AgentHub compatibility test';
const path = ['account', 'session', 'content'];

describe('cross-package encryption contract', () => {
    it('keeps agent and CLI derivation outputs byte-identical', async () => {
        const [agentRoot, cliRoot] = await Promise.all([
            deriveAgentRoot(seed, usage),
            deriveCliRoot(seed, usage),
        ]);
        expect(agentRoot.key).toEqual(cliRoot.key);
        expect(agentRoot.chainCode).toEqual(cliRoot.chainCode);

        const [agentChild, cliChild] = await Promise.all([
            deriveAgentChild(agentRoot.chainCode, path[0]),
            deriveCliChild(cliRoot.chainCode, path[0]),
        ]);
        expect(agentChild.key).toEqual(cliChild.key);
        expect(agentChild.chainCode).toEqual(cliChild.chainCode);

        const [agentKey, cliKey] = await Promise.all([
            deriveAgentKey(seed, usage, path),
            deriveCliKey(seed, usage, path),
        ]);
        expect(agentKey).toEqual(cliKey);
    });

    it('keeps version-0 AES-GCM bundles decryptable in both directions', () => {
        const dataKey = Uint8Array.from({ length: 32 }, (_, index) => index);
        const payload = {
            sessionId: 'session-1',
            metadata: { active: true, count: 3 },
        };

        const agentBundle = encryptAgentDataKey(payload, dataKey);
        const cliBundle = encryptCliDataKey(payload, dataKey);

        expect(agentBundle[0]).toBe(DATA_KEY_BUNDLE_VERSION);
        expect(cliBundle[0]).toBe(DATA_KEY_BUNDLE_VERSION);
        expect(agentBundle.length).toBeGreaterThanOrEqual(DATA_KEY_HEADER_BYTES + DATA_KEY_AUTH_TAG_BYTES);
        expect(cliBundle.length).toBeGreaterThanOrEqual(DATA_KEY_HEADER_BYTES + DATA_KEY_AUTH_TAG_BYTES);
        expect(DATA_KEY_HEADER_BYTES).toBe(1 + DATA_KEY_NONCE_BYTES);

        expect(decryptCliDataKey(agentBundle, dataKey)).toEqual(payload);
        expect(decryptAgentDataKey(cliBundle, dataKey)).toEqual(payload);
    });

    it('keeps the resume content key pair aligned with the Agent implementation', () => {
        const agentPair = deriveAgentContentKeyPair(seed);
        const cliPair = deriveCliContentKeyPair(seed);
        expect(cliPair.publicKey).toEqual(agentPair.publicKey);
        expect(cliPair.secretKey).toEqual(agentPair.secretKey);
    });
});
