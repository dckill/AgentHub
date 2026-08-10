import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'minio';
import * as crypto from 'crypto';

const useLocalStorage = !process.env.S3_HOST;
const dataDir = process.env.DATA_DIR || './data';
const localFilesDir = path.join(dataDir, 'files');
const LOCAL_FILE_URL_TTL_MS = 24 * 60 * 60 * 1000;

// S3 config (only used when S3_HOST is set)
let s3client: any = null;
let s3bucket: string = '';
let s3host: string = '';
let s3public: string = '';

if (!useLocalStorage) {
    const s3Port = process.env.S3_PORT ? parseInt(process.env.S3_PORT, 10) : undefined;
    const s3UseSSL = process.env.S3_USE_SSL ? process.env.S3_USE_SSL === 'true' : true;
    const s3Region = process.env.S3_REGION || 'us-east-1';
    s3client = new Client({
        endPoint: process.env.S3_HOST!,
        port: s3Port,
        useSSL: s3UseSSL,
        accessKey: process.env.S3_ACCESS_KEY!,
        secretKey: process.env.S3_SECRET_KEY!,
        region: s3Region,
    });
    s3bucket = process.env.S3_BUCKET!;
    s3host = process.env.S3_HOST!;
    s3public = process.env.S3_PUBLIC_URL!;
}

function localFileSigningSecret() {
    const dedicated = process.env.LOCAL_FILE_SIGNING_SECRET;
    if (dedicated) return dedicated;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required environment variable: LOCAL_FILE_SIGNING_SECRET');
    }
    return process.env.AGENTHUB_MASTER_SECRET || 'development-local-file-secret';
}

function signLocalFilePath(filePath: string, expiresAt: number) {
    return crypto
        .createHmac('sha256', localFileSigningSecret())
        .update(`${filePath}:${expiresAt}`)
        .digest('base64url');
}

export function createLocalFileToken(filePath: string, expiresAt = Date.now() + LOCAL_FILE_URL_TTL_MS) {
    return `${expiresAt}.${signLocalFilePath(filePath, expiresAt)}`;
}

export function verifyLocalFileToken(filePath: string, token: unknown) {
    if (typeof token !== 'string') {
        return false;
    }

    const separatorIndex = token.indexOf('.');
    if (separatorIndex <= 0) {
        return false;
    }

    const expiresAt = Number(token.slice(0, separatorIndex));
    const signature = token.slice(separatorIndex + 1);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
        return false;
    }

    const expected = signLocalFilePath(filePath, expiresAt);
    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

export { s3client, s3bucket, s3host };

export async function loadFiles() {
    if (useLocalStorage) {
        fs.mkdirSync(localFilesDir, { recursive: true });
        return;
    }
    await s3client.bucketExists(s3bucket);
}

export function getPublicUrl(filePath: string) {
    if (useLocalStorage) {
        const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || '13017'}`;
        return `${baseUrl}/files/${filePath}?token=${encodeURIComponent(createLocalFileToken(filePath))}`;
    }
    return `${s3public}/${filePath}`;
}

export function isLocalStorage() {
    return useLocalStorage;
}

export function getLocalFilesDir() {
    return localFilesDir;
}

export async function putLocalFile(filePath: string, data: Buffer) {
    const fullPath = path.join(localFilesDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, data);
}

/** Delete every encrypted attachment owned by one session. */
export async function deleteSessionAttachments(sessionId: string): Promise<void> {
    const prefix = `sessions/${sessionId}/attachments`;
    if (useLocalStorage) {
        const attachmentDir = path.join(localFilesDir, prefix);
        if (fs.existsSync(attachmentDir)) fs.rmSync(attachmentDir, { recursive: true, force: true });
        return;
    }

    const stream = s3client.listObjects(s3bucket, `${prefix}/`, true);
    const keys = await new Promise<string[]>((resolve, reject) => {
        const collected: string[] = [];
        stream.on('data', (item: { name?: string }) => {
            if (item.name) collected.push(item.name);
        });
        stream.on('end', () => resolve(collected));
        stream.on('error', reject);
    });
    if (keys.length > 0) await s3client.removeObjects(s3bucket, keys);
}

export type ImageRef = {
    width: number;
    height: number;
    thumbhash: string;
    path: string;
}
