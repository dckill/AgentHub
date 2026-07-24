import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiMachineClient } from './apiMachine';

describe('ApiMachineClient file transfers', () => {
    let tempDir: string | null = null;

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    it('streams binary chunks with multiple chunks in flight when the receiver supports it', async () => {
        tempDir = await mkdtemp(path.join(tmpdir(), 'agenthub-file-transfer-'));
        const filePath = path.join(tempDir, 'payload.bin');
        const chunkSize = 64 * 1024;
        await writeFile(filePath, Buffer.concat([
            Buffer.alloc(chunkSize, 'a'),
            Buffer.alloc(chunkSize, 'b'),
            Buffer.alloc(chunkSize, 'c'),
        ]));

        const emitted: any[] = [];
        const ackResolvers: Array<() => void> = [];
        const client = new ApiMachineClient('token', {
            id: 'machine-a',
            encryptionKey: new Uint8Array(32),
            encryptionVariant: 'legacy',
        } as any);

        (client as any).socket = {
            timeout: () => ({
                emitWithAck: vi.fn(async (_event: string, data: any) => {
                    emitted.push(data);
                    await new Promise<void>((resolve) => ackResolvers.push(resolve));
                    return { ok: true };
                }),
            }),
        };

        const streamPromise = (client as any).prepareAndStartFileTransfer(
            {
                transferId: 'transfer-a',
                attemptId: 'attempt-a',
                path: filePath,
                offset: 0,
                chunkSize,
                acceptsBinary: true,
                maxInFlightChunks: 3,
            },
            'target-socket',
            vi.fn(),
        );

        let assertionError: unknown;
        try {
            await vi.waitFor(() => {
                expect(emitted.length).toBeGreaterThanOrEqual(3);
            }, { timeout: 250 });

            expect(emitted[0]).toEqual(expect.objectContaining({
                transferId: 'transfer-a',
                targetSocketId: 'target-socket',
                metadata: expect.objectContaining({
                    transferId: 'transfer-a',
                    attemptId: 'attempt-a',
                    offset: 0,
                    bytesRead: chunkSize,
                    totalSize: chunkSize * 3,
                    done: false,
                }),
                bytes: expect.any(Uint8Array),
            }));
            expect(emitted[0].payload).toBeUndefined();
            expect(emitted[0].bytes.byteLength).toBe(chunkSize);
            expect(Buffer.from(emitted[0].bytes.subarray(0, 4)).toString('utf8')).toBe('aaaa');
        } catch (error) {
            assertionError = error;
        } finally {
            while (ackResolvers.length > 0) {
                ackResolvers.shift()?.();
            }
            await streamPromise;
        }

        if (assertionError) {
            throw assertionError;
        }
    });
});
