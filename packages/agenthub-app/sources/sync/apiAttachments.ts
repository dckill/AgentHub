import type { AuthCredentials } from '@/auth/tokenStorage';
import { getServerUrl } from './serverConfig';
import { appendFormFile } from './uploadFormFile';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentUploadTarget = {
    ref: string;
    uploadUrl: string;
    method: 'POST';
    formFields?: Record<string, string>;
};

function reachableUrl(url: string): string {
    try {
        const target = new URL(url);
        if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) return url;
        const server = new URL(getServerUrl());
        target.protocol = server.protocol;
        target.host = server.host;
        return target.toString();
    } catch {
        return url;
    }
}

export async function requestAttachmentUpload(
    credentials: AuthCredentials,
    sessionId: string,
    filename: string,
    encryptedSize: number,
): Promise<AttachmentUploadTarget> {
    if (encryptedSize > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds the 10MB encrypted upload limit');
    const response = await fetch(`${getServerUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/attachments/request-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, size: encryptedSize }),
    });
    if (!response.ok) throw new Error(`Attachment upload reservation failed (${response.status})`);
    const target = await response.json() as AttachmentUploadTarget;
    return { ...target, uploadUrl: reachableUrl(target.uploadUrl) };
}

export async function uploadEncryptedAttachment(
    target: Pick<AttachmentUploadTarget, 'uploadUrl' | 'method' | 'formFields'>,
    bytes: Uint8Array,
    credentials: AuthCredentials,
): Promise<void> {
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds the 10MB encrypted upload limit');
    if (target.method === 'POST' && target.formFields) {
        const form = new FormData();
        for (const [key, value] of Object.entries(target.formFields ?? {})) form.append(key, value);
        const cleanup = await appendFormFile(form, bytes, 'file', 'blob.enc', 'application/octet-stream');
        try {
            const response = await fetch(target.uploadUrl, { method: 'POST', body: form });
            if (!response.ok) throw new Error(`Attachment blob upload failed (${response.status})`);
        } finally {
            await cleanup();
        }
        return;
    }
    const response = await fetch(target.uploadUrl, {
        method: target.method,
        headers: {
            'Content-Type': 'application/octet-stream',
            Authorization: `Bearer ${credentials.token}`,
        },
        body: new Uint8Array(bytes).buffer,
    });
    if (!response.ok) throw new Error(`Attachment blob upload failed (${response.status})`);
}

export async function downloadEncryptedAttachment(
    credentials: AuthCredentials,
    sessionId: string,
    ref: string,
): Promise<Uint8Array> {
    const serverUrl = getServerUrl();
    const reservation = await fetch(`${serverUrl}/v1/sessions/${encodeURIComponent(sessionId)}/attachments/request-download`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref }),
    });
    if (!reservation.ok) throw new Error(`Attachment download reservation failed (${reservation.status})`);
    const { downloadUrl: rawUrl } = await reservation.json() as { downloadUrl: string };
    const downloadUrl = reachableUrl(rawUrl);
    const response = await fetch(downloadUrl, {
        headers: downloadUrl.startsWith(serverUrl) ? { Authorization: `Bearer ${credentials.token}` } : undefined,
    });
    if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Attachment download exceeds the 10MB limit');
    return new Uint8Array(buffer);
}
