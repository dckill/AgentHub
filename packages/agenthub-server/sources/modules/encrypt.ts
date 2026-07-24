import { KeyTree, crypto } from "privacy-kit";
import { readVersionedSecrets } from "@/config/versionedSecrets";

let activeKeyTree: KeyTree | null = null;
let decryptionKeyTrees: KeyTree[] = [];

export async function initEncrypt() {
    const { activeVersion, keys } = readVersionedSecrets({
        keysEnv: 'AGENTHUB_DATA_ENCRYPTION_KEYS',
        activeVersionEnv: 'AGENTHUB_DATA_ENCRYPTION_KEY_VERSION',
        fallbackSecret: process.env.NODE_ENV === 'production' ? undefined : process.env.AGENTHUB_MASTER_SECRET,
    });
    const initialized = new Map<number, KeyTree>();
    for (const [version, key] of keys) {
        initialized.set(version, new KeyTree(await crypto.deriveSecureKey({
            key,
            // Preserve the legacy derivation label so old ciphertext remains readable.
            usage: 'agenthub-server-tokens',
        })));
    }
    activeKeyTree = initialized.get(activeVersion)!;
    decryptionKeyTrees = [activeKeyTree, ...[...initialized.entries()]
        .filter(([version]) => version !== activeVersion)
        .map(([, tree]) => tree)];
}

function activeTree(): KeyTree {
    if (!activeKeyTree) throw new Error('Server encryption module not initialized');
    return activeKeyTree;
}

function decryptWithAny<T>(operation: (tree: KeyTree) => T): T {
    let lastError: unknown;
    for (const tree of decryptionKeyTrees) {
        try { return operation(tree); } catch (error) { lastError = error; }
    }
    throw lastError ?? new Error('Server encryption module not initialized');
}

export function encryptString(path: string[], value: string) {
    return activeTree().symmetricEncrypt(path, value);
}

export function encryptBytes(path: string[], bytes: Uint8Array<ArrayBuffer>) {
    return activeTree().symmetricEncrypt(path, bytes);
}

export function decryptString(path: string[], encrypted: Uint8Array<ArrayBuffer>) {
    return decryptWithAny(tree => tree.symmetricDecryptString(path, encrypted));
}

export function decryptBytes(path: string[], encrypted: Uint8Array<ArrayBuffer>) {
    return decryptWithAny(tree => tree.symmetricDecryptBuffer(path, encrypted));
}
