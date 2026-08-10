import { describe, expect, it, vi } from 'vitest';
import { loadSessionSnapshot } from './sessionSnapshotLoadLifecycle';

type RecordShape = { id: string };

const request = () => ({
    signal: new AbortController().signal,
    assertCurrent: vi.fn(),
});

describe('loadSessionSnapshot', () => {
    it('treats a 404 as a missing session without decrypting', async () => {
        const decrypt = vi.fn();

        await expect(loadSessionSnapshot<RecordShape, string>({
            runRequest: async (operation) => operation(request()),
            fetch: async () => ({ status: 404, data: {} }),
            decrypt,
        })).resolves.toBeNull();

        expect(decrypt).not.toHaveBeenCalled();
    });

    it('treats a response without a session record as missing', async () => {
        const decrypt = vi.fn();

        await expect(loadSessionSnapshot<RecordShape, string>({
            runRequest: async (operation) => operation(request()),
            fetch: async () => ({ status: 200, data: { missing: true } }),
            decrypt,
        })).resolves.toBeNull();

        expect(decrypt).not.toHaveBeenCalled();
    });

    it('does not decrypt after the account request becomes stale', async () => {
        const pageRequest = request();
        pageRequest.assertCurrent.mockImplementation(() => {
            throw new DOMException('stale', 'AbortError');
        });
        const decrypt = vi.fn();

        await expect(loadSessionSnapshot<RecordShape, string>({
            runRequest: async (operation) => operation(pageRequest),
            fetch: async () => ({ status: 200, data: { session: { id: 's1' } } }),
            decrypt,
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(decrypt).not.toHaveBeenCalled();
    });

    it('passes the record and request to decryption and returns its result', async () => {
        const pageRequest = request();
        const decrypt = vi.fn(async (record: RecordShape) => `decrypted:${record.id}`);

        await expect(loadSessionSnapshot<RecordShape, string>({
            runRequest: async (operation) => operation(pageRequest),
            fetch: async () => ({ status: 200, data: { session: { id: 's2' } } }),
            decrypt,
        })).resolves.toBe('decrypted:s2');

        expect(decrypt).toHaveBeenCalledWith({ id: 's2' }, pageRequest);
    });
});
