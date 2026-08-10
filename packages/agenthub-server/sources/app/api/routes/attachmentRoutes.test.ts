import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const mocks = vi.hoisted(() => ({
    findFirst: vi.fn(),
    putLocalFile: vi.fn(),
    verifyLocalFileToken: vi.fn(),
}));

vi.mock('@/storage/db', () => ({
    db: { session: { findFirst: mocks.findFirst } },
}));
vi.mock('@/storage/files', () => ({
    getLocalFilesDir: vi.fn(() => '/tmp/agenthub-attachment-tests'),
    isLocalStorage: vi.fn(() => true),
    putLocalFile: mocks.putLocalFile,
    createLocalFileToken: vi.fn(() => 'upload-token'),
    verifyLocalFileToken: mocks.verifyLocalFileToken,
    s3bucket: '',
    s3client: null,
}));

import { attachmentRoutes, MAX_ATTACHMENT_BYTES, parseSessionAttachmentRef } from './attachmentRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    app.decorate('authenticate', async (request: { userId: string }) => {
        request.userId = 'user-1';
    });
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    attachmentRoutes(typed);
    await app.ready();
    return app;
}

beforeEach(() => {
    mocks.findFirst.mockReset().mockResolvedValue({ id: 'session-1' });
    mocks.putLocalFile.mockReset().mockResolvedValue(undefined);
    mocks.verifyLocalFileToken.mockReset().mockImplementation((_ref, token) => token === 'upload-token');
});

describe('attachment routes', () => {
    it('only accepts refs owned by the requested session', () => {
        expect(parseSessionAttachmentRef('session-1', 'sessions/session-1/attachments/file.enc')).toBe('file.enc');
        expect(parseSessionAttachmentRef('session-1', 'sessions/session-2/attachments/file.enc')).toBeNull();
        expect(parseSessionAttachmentRef('session-1', 'sessions/session-1/attachments/../secret')).toBeNull();
    });

    it('issues an opaque local upload target after checking session ownership', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/session-1/attachments/request-upload',
            headers: { host: 'agenthub.test:13017' },
            payload: { filename: '../../private.png', size: 1024 },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ method: 'POST' });
        expect(response.json().ref).toMatch(/^sessions\/session-1\/attachments\/[0-9a-f-]+\.enc$/);
        expect(response.json().uploadUrl).not.toContain('private.png');
        expect(response.json().uploadUrl).toContain('token=upload-token');
        expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: 'session-1', accountId: 'user-1' }, select: { id: true } });
        await app.close();
    });

    it('rejects oversized upload reservations before allocating storage', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/session-1/attachments/request-upload',
            payload: { filename: 'large.png', size: MAX_ATTACHMENT_BYTES + 1 },
        });

        expect(response.statusCode).toBe(400);
        expect(mocks.findFirst).not.toHaveBeenCalled();
        await app.close();
    });

    it('rejects cross-session download refs before returning a URL', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/session-1/attachments/request-download',
            payload: { ref: 'sessions/session-2/attachments/file.enc' },
        });

        expect(response.statusCode).toBe(400);
        expect(mocks.findFirst).not.toHaveBeenCalled();
        await app.close();
    });

    it('stores local encrypted bytes only after ownership validation', async () => {
        const app = await createApp();
        const body = Buffer.from([1, 2, 3, 4]);
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/session-1/attachments/file.enc?token=upload-token',
            headers: { 'content-type': 'application/octet-stream' },
            payload: body,
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.putLocalFile).toHaveBeenCalledWith('sessions/session-1/attachments/file.enc', body);
        await app.close();
    });

    it('rejects direct local uploads without a valid reservation token', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/session-1/attachments/file.enc?token=invalid',
            headers: { 'content-type': 'application/octet-stream' },
            payload: Buffer.from([1]),
        });

        expect(response.statusCode).toBe(403);
        expect(mocks.findFirst).not.toHaveBeenCalled();
        expect(mocks.putLocalFile).not.toHaveBeenCalled();
        await app.close();
    });
});
