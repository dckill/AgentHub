import { describe, expect, it, vi } from 'vitest';
import { uploadImageAttachments } from './sendAttachmentUploadApplication';

const image = {
    data: 'encoded',
    mimeType: 'image/png',
    name: 'photo.png',
    width: 20,
    height: 30,
};

const credentials = { token: 'token', secret: 'secret' };
const blobKey = new Uint8Array([1, 2, 3]);

describe('uploadImageAttachments', () => {
    it('fails closed when credentials or blob key are unavailable', async () => {
        const decode = vi.fn();
        const requestUpload = vi.fn();

        await expect(uploadImageAttachments({
            sessionId: 'session-1',
            images: [image],
            credentials: null,
            blobKey,
            decodeBase64: decode,
            encryptBlob: vi.fn(),
            requestUpload,
            uploadEncrypted: vi.fn(),
            logFailure: vi.fn(),
        })).resolves.toEqual({ uploaded: [], failed: 1 });

        expect(decode).not.toHaveBeenCalled();
        expect(requestUpload).not.toHaveBeenCalled();
    });

    it('uploads each non-empty image and counts individual failures', async () => {
        const logFailure = vi.fn();
        const uploadEncrypted = vi.fn(async () => undefined);
        const requestUpload = vi.fn()
            .mockResolvedValueOnce({ ref: 'ref-1', uploadUrl: 'https://upload/1', method: 'PUT' as const })
            .mockRejectedValueOnce(new Error('reservation failed'));
        const decodeBase64 = vi.fn((value: string) => value === 'encoded' ? new Uint8Array([4, 5]) : new Uint8Array());

        const result = await uploadImageAttachments({
            sessionId: 'session-1',
            images: [image, { ...image, data: 'empty', name: undefined }],
            credentials,
            blobKey,
            decodeBase64,
            encryptBlob: vi.fn(() => new Uint8Array([9, 9])),
            requestUpload,
            uploadEncrypted,
            logFailure,
        });

        expect(result).toEqual({
            uploaded: [{ ref: 'ref-1', name: 'photo.png', size: 2, mimeType: 'image/png', width: 20, height: 30 }],
            failed: 1,
        });
        expect(uploadEncrypted).toHaveBeenCalledOnce();
        expect(logFailure).toHaveBeenCalledOnce();
    });

    it('treats empty decoded bytes as a failed attachment without requesting an upload', async () => {
        const requestUpload = vi.fn();
        const logFailure = vi.fn();

        await expect(uploadImageAttachments({
            sessionId: 'session-1',
            images: [{ ...image, data: 'empty' }],
            credentials,
            blobKey,
            decodeBase64: () => new Uint8Array(),
            encryptBlob: vi.fn(),
            requestUpload,
            uploadEncrypted: vi.fn(),
            logFailure,
        })).resolves.toEqual({ uploaded: [], failed: 1 });

        expect(requestUpload).not.toHaveBeenCalled();
        expect(logFailure).toHaveBeenCalledWith('Attachment is empty');
    });

    it('stops before encrypted upload when the account becomes stale after reservation', async () => {
        let currentGeneration = true;
        const uploadEncrypted = vi.fn(async () => undefined);
        const requestUpload = vi.fn(async () => {
            currentGeneration = false;
            return { ref: 'ref-1', uploadUrl: 'https://upload/1', method: 'POST' as const };
        });

        await expect(uploadImageAttachments({
            sessionId: 'session-1',
            images: [image],
            credentials,
            blobKey,
            decodeBase64: () => new Uint8Array([4, 5]),
            encryptBlob: () => new Uint8Array([9, 9]),
            requestUpload,
            uploadEncrypted,
            logFailure: vi.fn(),
            isCurrent: () => currentGeneration,
        })).resolves.toEqual({ uploaded: [], failed: 0 });

        expect(uploadEncrypted).not.toHaveBeenCalled();
    });

    it('stops before upload reservation when the account becomes stale during encryption', async () => {
        let currentGeneration = true;
        const requestUpload = vi.fn();

        await expect(uploadImageAttachments({
            sessionId: 'session-1',
            images: [image],
            credentials,
            blobKey,
            decodeBase64: () => new Uint8Array([4, 5]),
            encryptBlob: () => {
                currentGeneration = false;
                return new Uint8Array([9, 9]);
            },
            requestUpload,
            uploadEncrypted: vi.fn(),
            logFailure: vi.fn(),
            isCurrent: () => currentGeneration,
        })).resolves.toEqual({ uploaded: [], failed: 0 });

        expect(requestUpload).not.toHaveBeenCalled();
    });
});
