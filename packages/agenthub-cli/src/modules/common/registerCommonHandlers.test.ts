import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeBase64, decrypt, encodeBase64, encrypt } from '@/api/encryption';
import { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager';
import { registerCommonHandlers } from './registerCommonHandlers';

const key = new Uint8Array(32).fill(7);

async function callReadFile(root: string, params: Record<string, unknown>) {
    return callCommonHandler(root, 'readFile', params);
}

async function callCommonHandler(root: string, method: string, params: Record<string, unknown>) {
    const manager = new RpcHandlerManager({
        scopePrefix: 'scope',
        encryptionKey: key,
        encryptionVariant: 'legacy',
        logger: () => {},
    });
    registerCommonHandlers(manager, root);

    const encrypted = encodeBase64(encrypt(key, 'legacy', params));
    const response = await manager.handleRequest({
        method: `scope:${method}`,
        params: encrypted,
    });
    return decrypt(key, 'legacy', decodeBase64(response)) as any;
}

describe('registerCommonHandlers readFile', () => {
    let root: string | null = null;

    afterEach(async () => {
        if (root) {
            await rm(root, { recursive: true, force: true });
            root = null;
        }
    });

    it('reads a requested byte range for resumable downloads', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-read-file-'));
        const filePath = join(root, 'sample.txt');
        await writeFile(filePath, 'abcdefghijkl');

        const result = await callReadFile(root, {
            path: filePath,
            offset: 2,
            length: 5,
        });

        expect(result).toMatchObject({
            success: true,
            totalSize: 12,
            offset: 2,
            bytesRead: 5,
            truncated: true,
        });
        expect(Buffer.from(result.content, 'base64').toString('utf8')).toBe('cdefg');
    });

    it('rejects malformed registered RPC requests before entering a handler', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-invalid-rpc-'));

        const result = await callReadFile(root, { path: 42 });

        expect(result).toMatchObject({
            __rpcError: {
                code: 'INVALID_REQUEST',
                message: 'Invalid RPC request: readFile',
            },
        });
    });

    it('normalizes a successful void RPC handler response to encrypted null', async () => {
        const manager = new RpcHandlerManager({
            scopePrefix: 'scope',
            encryptionKey: key,
            encryptionVariant: 'legacy',
            logger: () => {},
        });
        manager.registerHandler('abort', async () => undefined);
        const encrypted = encodeBase64(encrypt(key, 'legacy', { reason: 'user cancelled' }));

        const response = await manager.handleRequest({ method: 'scope:abort', params: encrypted });

        expect(decrypt(key, 'legacy', decodeBase64(response))).toBeNull();
    });

    it('deletes a file through the common deleteFile handler', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-delete-file-'));
        const filePath = join(root, 'sample.txt');
        await writeFile(filePath, 'delete me');

        const result = await callCommonHandler(root, 'deleteFile', { path: filePath });

        expect(result).toEqual({ success: true });
        await expect(stat(filePath)).rejects.toThrow();
    });

    it('runs ripgrep from the registered working directory when cwd is omitted', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-ripgrep-cwd-'));
        await writeFile(join(root, 'unique-session-file.txt'), 'session scoped');

        const result = await callCommonHandler(root, 'ripgrep', { args: ['--files'] });

        expect(result.success).toBe(true);
        expect(result.stdout).toContain('unique-session-file.txt');
    });

    it('executes argv literally without evaluating shell substitution', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-structured-exec-'));
        const sentinel = join(root, 'PWNED');
        const maliciousArg = `$(touch ${sentinel})`;

        const result = await callCommonHandler(root, 'exec', {
            executable: process.execPath,
            args: ['-e', 'process.stdout.write(process.argv[1])', maliciousArg],
            cwd: root,
        });

        expect(result).toMatchObject({ success: true, stdout: maliciousArg, exitCode: 0 });
        await expect(stat(sentinel)).rejects.toThrow();
    });

    it('reads a real malicious filename as one argv entry without creating a sentinel', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-malicious-file-'));
        const maliciousName = '$(touch PWNED)';
        await writeFile(join(root, maliciousName), 'literal file contents');

        const result = await callCommonHandler(root, 'exec', {
            executable: 'cat',
            args: ['--', maliciousName],
            cwd: root,
        });

        expect(result).toMatchObject({ success: true, stdout: 'literal file contents', exitCode: 0 });
        await expect(stat(join(root, 'PWNED'))).rejects.toThrow();
    });

    it('classifies symlink targets when listing a directory', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-list-directory-'));
        await mkdir(join(root, 'real-dir'));
        await writeFile(join(root, 'real-file.txt'), 'hello');
        await symlink(join(root, 'real-dir'), join(root, 'linked-dir'), 'dir');
        await symlink(join(root, 'real-file.txt'), join(root, 'linked-file.txt'), 'file');

        const result = await callCommonHandler(root, 'listDirectory', { path: root });

        expect(result.success).toBe(true);
        expect(result.entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'linked-dir', type: 'directory' }),
            expect.objectContaining({ name: 'linked-file.txt', type: 'file' }),
        ]));
    });

    it('includes symlink targets in directory trees without recursively traversing symlink directories', async () => {
        root = await mkdtemp(join(tmpdir(), 'agenthub-directory-tree-'));
        await mkdir(join(root, 'real-dir'));
        await writeFile(join(root, 'real-dir', 'nested.txt'), 'inside');
        await writeFile(join(root, 'real-file.txt'), 'hello');
        await symlink(join(root, 'real-dir'), join(root, 'linked-dir'), 'dir');
        await symlink(join(root, 'real-file.txt'), join(root, 'linked-file.txt'), 'file');

        const result = await callCommonHandler(root, 'getDirectoryTree', { path: root, maxDepth: 2 });

        expect(result.success).toBe(true);
        expect(result.tree.children).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'linked-dir', type: 'directory' }),
            expect.objectContaining({ name: 'linked-file.txt', type: 'file' }),
        ]));
        const linkedDir = result.tree.children.find((entry: { name: string }) => entry.name === 'linked-dir');
        expect(linkedDir).not.toHaveProperty('children');
    });
});
