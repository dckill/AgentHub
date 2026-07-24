import { describe, expect, it, vi } from 'vitest';
import {
    FILE_PREVIEW_RPC_CHUNK_BYTES,
    buildFileByteSizeExec,
    buildReadFileBase64Exec,
    parseByteSizeOutput,
    readSessionFileBase64ContentInChunks,
} from './filePreviewFallback';

describe('filePreviewFallback', () => {
    it('builds structured byte size and base64 commands', () => {
        expect(buildFileByteSizeExec("a b'c.png")).toEqual({ executable: 'wc', args: ['-c', '--', "a b'c.png"] });
        expect(buildReadFileBase64Exec("a b'c.png")).toEqual({ executable: 'base64', args: ["a b'c.png"] });
    });

    it('parses byte size output safely', () => {
        expect(parseByteSizeOutput('2048\n')).toBe(2048);
        expect(parseByteSizeOutput('nope')).toBeNull();
    });

    it('uses a large base64-safe RPC chunk size', () => {
        expect(FILE_PREVIEW_RPC_CHUNK_BYTES).toBeGreaterThanOrEqual(1536 * 1024);
        expect(FILE_PREVIEW_RPC_CHUNK_BYTES % 3).toBe(0);
    });

    it('reads preview file content through bounded readFile chunks', async () => {
        const first = Buffer.alloc(FILE_PREVIEW_RPC_CHUNK_BYTES, 0x61);
        const second = Buffer.from('tail');
        const runSessionReadFile = vi.fn()
            .mockResolvedValueOnce({
                success: true,
                content: first.toString('base64'),
                totalSize: first.length + second.length,
                offset: 0,
                bytesRead: first.length,
                truncated: true,
            })
            .mockResolvedValueOnce({
                success: true,
                content: second.toString('base64'),
                totalSize: first.length + second.length,
                offset: first.length,
                bytesRead: second.length,
                truncated: false,
            });

        const result = await readSessionFileBase64ContentInChunks(
            's1',
            '/repo/image.png',
            first.length + second.length,
            runSessionReadFile,
        );

        expect(runSessionReadFile).toHaveBeenNthCalledWith(
            1,
            's1',
            '/repo/image.png',
            { offset: 0, length: FILE_PREVIEW_RPC_CHUNK_BYTES },
        );
        expect(runSessionReadFile).toHaveBeenNthCalledWith(
            2,
            's1',
            '/repo/image.png',
            { offset: FILE_PREVIEW_RPC_CHUNK_BYTES, length: second.length },
        );
        expect(result).toEqual({
            success: true,
            content: first.toString('base64') + second.toString('base64'),
            totalSize: first.length + second.length,
            truncated: false,
        });
    });
});
