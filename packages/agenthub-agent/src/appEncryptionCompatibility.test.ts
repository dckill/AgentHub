import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../agenthub-app/sources/encryption/hmac_sha512', () => ({
    hmac_sha512: async (key: Uint8Array, data: Uint8Array) => {
        const hmac = createHmac('sha512', key);
        hmac.update(data);
        return new Uint8Array(hmac.digest());
    },
}));

import { deriveKey as deriveAppKey } from '../../agenthub-app/sources/encryption/deriveKey';
import { deriveKey as deriveAgentKey } from './encryption';
import { deriveKey as deriveCliKey } from '../../agenthub-cli/src/utils/deriveKey';

const seed = new TextEncoder().encode('three-package derivation parity');
const usage = 'AgentHub three-package parity';
const path = ['account', 'session', 'content'];

describe('App/Agent/CLI encryption compatibility', () => {
    it('keeps the same derived content key across all three runtimes', async () => {
        const [appKey, agentKey, cliKey] = await Promise.all([
            deriveAppKey(seed, usage, path),
            deriveAgentKey(seed, usage, path),
            deriveCliKey(seed, usage, path),
        ]);

        expect(appKey).toEqual(agentKey);
        expect(appKey).toEqual(cliKey);
    });
});
