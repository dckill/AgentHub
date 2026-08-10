import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./serverConfig', () => ({ getServerUrl: () => 'https://agenthub.test:8443' }));
vi.mock('./uploadFormFile', () => ({ appendFormFile: vi.fn() }));

import { downloadEncryptedAttachment, requestAttachmentUpload, uploadEncryptedAttachment } from './apiAttachments';

afterEach(() => vi.unstubAllGlobals());

describe('attachment API', () => {
    const credentials = { token: 'token-1', secret: 'secret' };

    it('reserves an owned upload and rewrites unusable loopback URLs', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            ref: 'sessions/s1/attachments/a.enc',
            uploadUrl: 'http://localhost:13017/v1/sessions/s1/attachments/a.enc',
            method: 'POST',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestAttachmentUpload(credentials, 's1', 'photo.png', 100)).resolves.toMatchObject({
            ref: 'sessions/s1/attachments/a.enc',
            uploadUrl: 'https://agenthub.test:8443/v1/sessions/s1/attachments/a.enc',
        });
        const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1];
        expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
    });

    it('uploads an exact standalone ArrayBuffer with auth for local storage', async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const parent = new Uint8Array([9, 1, 2, 9]);

        await uploadEncryptedAttachment({
            uploadUrl: 'https://agenthub.test:8443/v1/sessions/s1/attachments/a.enc',
            method: 'POST',
        }, parent.subarray(1, 3), credentials);

        const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1];
        expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2]));
        expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
    });

    it('keeps auth on a local raw POST target exposed through a different public origin', async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await uploadEncryptedAttachment({
            uploadUrl: 'https://uploads.agenthub.test/v1/sessions/s1/attachments/a.enc?token=signed',
            method: 'POST',
        }, new Uint8Array([1]), credentials);

        const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1];
        expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
    });

    it('uses auth only for the server reservation and local download URL', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ downloadUrl: 'https://objects.test/a.enc?signature=x' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(downloadEncryptedAttachment(credentials, 's1', 'sessions/s1/attachments/a.enc'))
            .resolves.toEqual(new Uint8Array([1, 2, 3]));
        expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer token-1' });
        expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined();
    });
});
