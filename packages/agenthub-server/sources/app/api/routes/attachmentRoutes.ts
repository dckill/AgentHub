import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { Fastify } from '../types';
import { db } from '@/storage/db';
import {
    createLocalFileToken,
    getLocalFilesDir,
    isLocalStorage,
    putLocalFile,
    s3bucket,
    s3client,
    verifyLocalFileToken,
} from '@/storage/files';
import { FixedWindowRateLimiter } from '../utils/resourceLimits';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const PRESIGNED_TTL_SECONDS = 15 * 60;
const uploadLimiter = new FixedWindowRateLimiter({ limit: 60, windowMs: 60_000, maxSubjects: 10_000 });

function firstHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function resolveBaseUrl(headers: Record<string, string | string[] | undefined>): string {
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
    const host = firstHeader(headers['x-forwarded-host']) ?? firstHeader(headers.host);
    const proto = firstHeader(headers['x-forwarded-proto']) ?? 'http';
    return host ? `${proto}://${host}` : `http://localhost:${process.env.PORT || '13017'}`;
}

export function parseSessionAttachmentRef(sessionId: string, ref: string): string | null {
    const prefix = `sessions/${sessionId}/attachments/`;
    if (!ref.startsWith(prefix)) return null;
    const filename = ref.slice(prefix.length);
    return filename && !filename.includes('/') && !filename.includes('..') ? filename : null;
}

function safeAttachmentFilename(filename: string): boolean {
    return filename.length > 0 && !filename.includes('/') && !filename.includes('..');
}

export function attachmentRoutes(app: Fastify) {
    app.post('/v1/sessions/:sessionId/attachments/request-upload', {
        schema: {
            params: z.object({ sessionId: z.string() }),
            body: z.object({ filename: z.string().min(1).max(255), size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES) }),
        },
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const { sessionId } = request.params;
        const userId = request.userId;
        const rate = uploadLimiter.consume(userId);
        if (!rate.allowed) {
            reply.header('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
            return reply.code(429).send({ error: 'Too many upload requests' });
        }
        const session = await db.session.findFirst({ where: { id: sessionId, accountId: userId }, select: { id: true } });
        if (!session) return reply.code(404).send({ error: 'Session not found' });

        const attachmentFile = `${crypto.randomUUID()}.enc`;
        const ref = `sessions/${sessionId}/attachments/${attachmentFile}`;
        if (isLocalStorage()) {
            const token = createLocalFileToken(ref, Date.now() + PRESIGNED_TTL_SECONDS * 1000);
            return reply.send({
                ref,
                uploadUrl: `${resolveBaseUrl(request.headers)}/v1/sessions/${sessionId}/attachments/${attachmentFile}?token=${encodeURIComponent(token)}`,
                method: 'POST' as const,
            });
        }

        const policy = s3client.newPostPolicy();
        policy.setBucket(s3bucket);
        policy.setKey(ref);
        policy.setExpires(new Date(Date.now() + PRESIGNED_TTL_SECONDS * 1000));
        policy.setContentLengthRange(0, MAX_ATTACHMENT_BYTES);
        const { postURL, formData } = await s3client.presignedPostPolicy(policy);
        return reply.send({ ref, uploadUrl: postURL, method: 'POST' as const, formFields: formData });
    });

    app.post('/v1/sessions/:sessionId/attachments/:attachmentFile', {
        bodyLimit: MAX_ATTACHMENT_BYTES,
        schema: {
            params: z.object({ sessionId: z.string(), attachmentFile: z.string() }),
            querystring: z.object({ token: z.string() }),
        },
        preHandler: app.authenticate,
    }, async (request, reply) => {
        if (!isLocalStorage()) return reply.code(404).send({ error: 'Direct upload unavailable' });
        const { sessionId, attachmentFile } = request.params;
        if (!safeAttachmentFilename(attachmentFile)) return reply.code(404).send({ error: 'Invalid attachment file' });
        const ref = `sessions/${sessionId}/attachments/${attachmentFile}`;
        if (!verifyLocalFileToken(ref, request.query.token)) {
            return reply.code(403).send({ error: 'Invalid or expired upload token' });
        }
        const session = await db.session.findFirst({ where: { id: sessionId, accountId: request.userId }, select: { id: true } });
        if (!session) return reply.code(404).send({ error: 'Session not found' });
        const body = request.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length > MAX_ATTACHMENT_BYTES) {
            return reply.code(413).send({ error: 'File too large' });
        }
        await putLocalFile(ref, body);
        return reply.send({ ok: true });
    });

    app.post('/v1/sessions/:sessionId/attachments/request-download', {
        schema: {
            params: z.object({ sessionId: z.string() }),
            body: z.object({ ref: z.string() }),
        },
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const { sessionId } = request.params;
        const attachmentFile = parseSessionAttachmentRef(sessionId, request.body.ref);
        if (!attachmentFile) return reply.code(400).send({ error: 'Invalid attachment ref' });
        const session = await db.session.findFirst({ where: { id: sessionId, accountId: request.userId }, select: { id: true } });
        if (!session) return reply.code(404).send({ error: 'Session not found' });
        if (isLocalStorage()) {
            return reply.send({
                downloadUrl: `${resolveBaseUrl(request.headers)}/v1/sessions/${sessionId}/attachments/${attachmentFile}`,
            });
        }
        return reply.send({
            downloadUrl: await s3client.presignedGetObject(s3bucket, request.body.ref, PRESIGNED_TTL_SECONDS),
        });
    });

    app.get('/v1/sessions/:sessionId/attachments/:attachmentFile', {
        schema: { params: z.object({ sessionId: z.string(), attachmentFile: z.string() }) },
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const { sessionId, attachmentFile } = request.params;
        if (!safeAttachmentFilename(attachmentFile)) return reply.code(404).send({ error: 'Invalid attachment file' });
        const session = await db.session.findFirst({ where: { id: sessionId, accountId: request.userId }, select: { id: true } });
        if (!session) return reply.code(404).send({ error: 'Session not found' });
        const ref = `sessions/${sessionId}/attachments/${attachmentFile}`;
        if (!isLocalStorage()) {
            return reply.redirect(await s3client.presignedGetObject(s3bucket, ref, PRESIGNED_TTL_SECONDS));
        }
        const base = path.resolve(getLocalFilesDir());
        const fullPath = path.resolve(base, ref);
        if (!fullPath.startsWith(`${base}${path.sep}`) || !fs.existsSync(fullPath)) {
            return reply.code(404).send({ error: 'Attachment not found' });
        }
        return reply.type('application/octet-stream').send(fs.createReadStream(fullPath));
    });
}
