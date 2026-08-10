import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import type { InputItem } from '../codexAppServerTypes';

export type InlineImage = {
    data: string;
    mimeType: string;
    name?: string;
};

export type SupportedImageType = {
    mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    extension: 'png' | 'jpg' | 'gif' | 'webp';
};

export function detectSupportedImageType(data: Uint8Array): SupportedImageType | null {
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e
        && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) {
        return { mimeType: 'image/png', extension: 'png' };
    }
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return { mimeType: 'image/jpeg', extension: 'jpg' };
    }
    if (data.length >= 6) {
        const header = new TextDecoder().decode(data.slice(0, 6));
        if (header === 'GIF87a' || header === 'GIF89a') return { mimeType: 'image/gif', extension: 'gif' };
    }
    if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46
        && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
        return { mimeType: 'image/webp', extension: 'webp' };
    }
    return null;
}

function sanitizePathSegment(value: string): string {
    const sanitized = value.trim()
        .replace(/[\\/]+/g, '_')
        .replace(/\.+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^_+|_+$/g, '');
    return sanitized || 'unknown-session';
}

export function resolveCodexImageCacheDir(opts: { sessionId: string; cacheRootDir?: string }): string {
    const root = resolve(opts.cacheRootDir ?? join(configuration.agentHubHomeDir, 'codex-image-cache'));
    const cacheDir = resolve(root, sanitizePathSegment(opts.sessionId));
    const relativePath = relative(root, cacheDir);
    return relativePath.startsWith('..') || isAbsolute(relativePath) ? join(root, 'invalid-session') : cacheDir;
}

function decodeStrictBase64(value: string): Uint8Array | null {
    const normalized = value.replace(/\s+/g, '');
    if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) return null;
    const bytes = new Uint8Array(Buffer.from(normalized, 'base64'));
    if (bytes.length === 0) return null;
    const expected = normalized.replace(/=+$/, '');
    const actual = Buffer.from(bytes).toString('base64').replace(/=+$/, '');
    return actual === expected ? bytes : null;
}

export async function prepareCodexInlineImageInputs(
    images: InlineImage[] | undefined,
    opts: { sessionId: string; cacheRootDir?: string },
): Promise<{ inputItems: InputItem[]; skipped: number }> {
    if (!images?.length) return { inputItems: [], skipped: 0 };
    const cacheDir = resolveCodexImageCacheDir(opts);
    const inputItems: InputItem[] = [];
    let skipped = 0;

    for (const image of images) {
        const bytes = decodeStrictBase64(image.data);
        const detected = bytes ? detectSupportedImageType(bytes) : null;
        if (!bytes || !detected) {
            skipped += 1;
            logger.debug('[Codex] Skipping malformed or unsupported inline image');
            continue;
        }
        try {
            await mkdir(cacheDir, { recursive: true, mode: 0o700 });
            await chmod(cacheDir, 0o700);
            const filePath = join(cacheDir, `${randomUUID()}.${detected.extension}`);
            await writeFile(filePath, Buffer.from(bytes), { mode: 0o600 });
            inputItems.push({ type: 'localImage', path: filePath });
        } catch (error) {
            skipped += 1;
            logger.debug('[Codex] Failed to cache inline image', error instanceof Error ? error.name : typeof error);
        }
    }
    return { inputItems, skipped };
}
