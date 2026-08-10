import { describe, expect, it } from 'vitest';

import { resolveNewMachineKey } from './newMachineKeyResolution';

describe('resolveNewMachineKey', () => {
    it('keeps legacy machines on the no-key path', async () => {
        await expect(resolveNewMachineKey(undefined, async () => new Uint8Array([1]))).resolves.toEqual({
            key: null,
            shouldRefresh: false,
        });
    });

    it('returns a decrypted key without refreshing on success', async () => {
        const key = new Uint8Array([1, 2, 3]);
        await expect(resolveNewMachineKey('encrypted-key', async () => key)).resolves.toEqual({
            key,
            shouldRefresh: false,
        });
    });

    it('fails closed and requests a machine refresh when decryption returns null', async () => {
        await expect(resolveNewMachineKey('encrypted-key', async () => null)).resolves.toEqual({
            key: null,
            shouldRefresh: true,
        });
    });

    it('fails closed and requests a machine refresh when decryption throws', async () => {
        await expect(resolveNewMachineKey('encrypted-key', async () => {
            throw new Error('malformed key');
        })).resolves.toEqual({
            key: null,
            shouldRefresh: true,
        });
    });
});
