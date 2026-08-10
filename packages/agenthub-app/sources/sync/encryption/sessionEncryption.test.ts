import { describe, expect, it, vi } from 'vitest';
import type { ApiMessage } from '../apiTypes';
import { EncryptionCache } from './encryptionCache';
import { SessionEncryption } from './sessionEncryption';

const encryptedMessage = {
    id: 'message-1',
    seq: 1,
    localId: null,
    content: { t: 'encrypted', c: 'AA==' },
    createdAt: 1,
} as ApiMessage;

describe('SessionEncryption message cache recovery', () => {
    it('does not cache a transient decryption failure as a permanent message result', async () => {
        const decrypt = vi.fn()
            .mockResolvedValueOnce([null])
            .mockResolvedValueOnce([{ role: 'user', content: [{ type: 'text', text: 'recovered' }] }]);
        const encryption = new SessionEncryption(
            'session-1',
            { encrypt: vi.fn(), decrypt },
            new EncryptionCache(),
        );

        const first = await encryption.decryptMessage(encryptedMessage);
        const second = await encryption.decryptMessage(encryptedMessage);

        expect(first?.content).toBeNull();
        expect(second?.content).toEqual({ role: 'user', content: [{ type: 'text', text: 'recovered' }] });
        expect(decrypt).toHaveBeenCalledTimes(2);
    });
});
