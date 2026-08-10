import {
    deriveKey as deriveSharedKey,
    deriveSecretKeyTreeChild as deriveSharedChild,
    deriveSecretKeyTreeRoot as deriveSharedRoot,
    type KeyTreeState,
} from '@artsum/agenthub-wire';

export type { KeyTreeState } from '@artsum/agenthub-wire';

export async function deriveSecretKeyTreeRoot(seed: Uint8Array, usage: string): Promise<KeyTreeState> {
    return deriveSharedRoot(seed, usage);
}

export async function deriveSecretKeyTreeChild(chainCode: Uint8Array, index: string): Promise<KeyTreeState> {
    return deriveSharedChild(chainCode, index);
}

export async function deriveKey(master: Uint8Array, usage: string, path: string[]): Promise<Uint8Array> {
    return deriveSharedKey(master, usage, path);
}
