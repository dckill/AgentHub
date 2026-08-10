import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));
vi.mock('@/configuration', () => ({
    configuration: { agentHubHomeDir: '/home/test/.agenthub' },
}));

import {
    detectSupportedImageType,
    prepareCodexInlineImageInputs,
    resolveCodexImageCacheDir,
} from './imageInput';

const tempDirs: string[] = [];

afterEach(async () => {
    while (tempDirs.length > 0) {
        await rm(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('Codex inline image input', () => {
    it('detects image types from bytes instead of trusting MIME metadata', () => {
        expect(detectSupportedImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
            .toEqual({ mimeType: 'image/png', extension: 'png' });
        expect(detectSupportedImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb])))
            .toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
        expect(detectSupportedImageType(new TextEncoder().encode('not an image'))).toBeNull();
    });

    it('writes a supported image into a private session cache for localImage input', async () => {
        const cacheRootDir = await mkdtemp(join(tmpdir(), 'agenthub-codex-image-'));
        tempDirs.push(cacheRootDir);
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

        const result = await prepareCodexInlineImageInputs([{
            data: Buffer.from(bytes).toString('base64'),
            mimeType: 'image/heic',
            name: '../../unsafe.heic',
        }], { sessionId: '../session-1', cacheRootDir });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        const item = result.inputItems[0];
        expect(item.type).toBe('localImage');
        if (item.type === 'localImage') {
            expect(item.path.startsWith(`${cacheRootDir}${sep}`)).toBe(true);
            expect(item.path).not.toContain('unsafe');
            expect(new Uint8Array(await readFile(item.path))).toEqual(bytes);
            if (process.platform !== 'win32') {
                expect((await stat(item.path)).mode & 0o777).toBe(0o600);
            }
        }
    });

    it('skips malformed and unsupported base64 without creating Codex inputs', async () => {
        const result = await prepareCodexInlineImageInputs([
            { data: 'not-base64!', mimeType: 'image/png', name: 'bad.png' },
            { data: Buffer.from('plain text').toString('base64'), mimeType: 'image/png', name: 'fake.png' },
        ], { sessionId: 'session-2' });

        expect(result).toEqual({ inputItems: [], skipped: 2 });
    });

    it('keeps malformed session ids inside AgentHub local state', () => {
        const root = '/tmp/agenthub-image-cache';
        const resolved = resolveCodexImageCacheDir({ sessionId: '../../outside', cacheRootDir: root });
        expect(resolved.startsWith(`${root}${sep}`)).toBe(true);
        expect(resolved).not.toContain('..');
    });
});
