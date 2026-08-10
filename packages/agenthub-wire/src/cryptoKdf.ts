import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';

const MASTER_SEED_SUFFIX = ' Master Seed';

export type KeyTreeState = {
    key: Uint8Array;
    chainCode: Uint8Array;
};

/** Portable HMAC-SHA512 primitive shared by Node, Agent and React Native. */
export function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
    return new Uint8Array(hmac(sha512, key, data));
}

export function deriveSecretKeyTreeRoot(seed: Uint8Array, usage: string): KeyTreeState {
    const input = new TextEncoder().encode(`${usage}${MASTER_SEED_SUFFIX}`);
    const derived = hmacSha512(input, seed);
    return {
        key: derived.slice(0, 32),
        chainCode: derived.slice(32),
    };
}

export function deriveSecretKeyTreeChild(chainCode: Uint8Array, index: string): KeyTreeState {
    const input = new Uint8Array([0x00, ...new TextEncoder().encode(index)]);
    const derived = hmacSha512(chainCode, input);
    return {
        key: derived.slice(0, 32),
        chainCode: derived.slice(32),
    };
}

export function deriveKey(master: Uint8Array, usage: string, path: string[]): Uint8Array {
    let state = deriveSecretKeyTreeRoot(master, usage);
    for (const index of path) {
        state = deriveSecretKeyTreeChild(state.chainCode, index);
    }
    return state.key;
}
