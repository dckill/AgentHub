import { describe, expect, it, vi } from 'vitest';
import { EncryptionCache } from './encryptionCache';
import { MachineEncryption } from './machineEncryption';

describe('MachineEncryption daemon state cache recovery', () => {
    it('does not cache a transient decryption failure as a permanent null state', async () => {
        const decrypt = vi.fn()
            .mockResolvedValueOnce([null])
            .mockResolvedValueOnce([{ status: 'running' }]);
        const encryption = new MachineEncryption(
            'machine-1',
            { encrypt: vi.fn(), decrypt },
            new EncryptionCache(),
        );

        const first = await encryption.decryptDaemonState(7, 'AA==');
        const second = await encryption.decryptDaemonState(7, 'AA==');

        expect(first).toBeNull();
        expect(second).toEqual({ status: 'running' });
        expect(decrypt).toHaveBeenCalledTimes(2);
    });
});
