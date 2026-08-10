export type NewMachineKeyResolution = {
    key: Uint8Array | null;
    shouldRefresh: boolean;
};

export async function resolveNewMachineKey(
    encryptedKey: string | null | undefined,
    decrypt: (value: string) => Promise<Uint8Array | null>,
): Promise<NewMachineKeyResolution> {
    if (!encryptedKey) {
        return { key: null, shouldRefresh: false };
    }

    try {
        const key = await decrypt(encryptedKey);
        return key ? { key, shouldRefresh: false } : { key: null, shouldRefresh: true };
    } catch {
        return { key: null, shouldRefresh: true };
    }
}
