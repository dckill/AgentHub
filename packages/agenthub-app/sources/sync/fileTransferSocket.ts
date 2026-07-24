import { apiSocket } from '@/sync/apiSocket';
import { sync } from '@/sync/sync';

export const STREAM_DOWNLOAD_CHUNK_BYTES = 512 * 1024;
export const STREAM_DOWNLOAD_IN_FLIGHT_CHUNKS = 8;
const FILE_TRANSFER_CONTROL_TIMEOUT_MS = 10_000;

export interface FileTransferStreamChunk {
    transferId: string;
    attemptId: string;
    offset: number;
    bytesRead: number;
    totalSize: number;
    bytes: Uint8Array;
    done?: boolean;
    error?: string;
}

interface DownloadViaStreamInput {
    machineId: string;
    transferId: string;
    attemptId: string;
    remotePath: string;
    offset: number;
    chunkSize?: number;
    maxInFlightChunks?: number;
    onChunk: (chunk: FileTransferStreamChunk) => Promise<void>;
}

function toUint8Array(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (Array.isArray(value)) {
        return new Uint8Array(value);
    }
    if (
        value
        && typeof value === 'object'
        && Array.isArray((value as { data?: unknown }).data)
    ) {
        return new Uint8Array((value as { data: number[] }).data);
    }
    throw new Error('Unsupported file transfer payload type');
}

function validateChunkEnvelope(value: any, transferId: string, attemptId: string): FileTransferStreamChunk {
    const metadata = value?.metadata;
    if (!metadata || typeof metadata !== 'object') {
        throw new Error('Invalid file transfer chunk metadata');
    }
    if (metadata.transferId !== transferId) {
        throw new Error('File transfer chunk id mismatch');
    }
    if (metadata.attemptId !== attemptId) {
        throw new Error('File transfer chunk attempt mismatch');
    }
    if (typeof metadata.offset !== 'number' || typeof metadata.bytesRead !== 'number' || typeof metadata.totalSize !== 'number') {
        throw new Error('Invalid file transfer chunk metadata');
    }
    const bytes = metadata.bytesRead > 0 ? toUint8Array(value.bytes) : new Uint8Array();
    if (bytes.byteLength !== metadata.bytesRead) {
        throw new Error('File transfer chunk size mismatch');
    }

    return {
        transferId: metadata.transferId,
        attemptId: metadata.attemptId,
        offset: metadata.offset,
        bytesRead: metadata.bytesRead,
        totalSize: metadata.totalSize,
        bytes,
        done: !!metadata.done,
        error: typeof metadata.error === 'string' ? metadata.error : undefined,
    };
}

export async function downloadMachineFileViaStream(input: DownloadViaStreamInput): Promise<void> {
    const machineEncryption = sync.encryption.getMachineEncryption(input.machineId);
    if (!machineEncryption) {
        throw new Error('Machine encryption is not ready');
    }

    let resolveStream: (() => void) | null = null;
    let rejectStream: ((error: Error) => void) | null = null;
    let settled = false;

    const streamPromise = new Promise<void>((resolve, reject) => {
        resolveStream = resolve;
        rejectStream = reject;
    });

    const unsubscribe = apiSocket.onFileTransferChunk(input.transferId, input.attemptId, async (envelope) => {
        try {
            const chunk = validateChunkEnvelope(envelope, input.transferId, input.attemptId);
            if (chunk.error) {
                throw new Error(chunk.error);
            }
            await input.onChunk(chunk);
            if (chunk.done && !settled) {
                settled = true;
                resolveStream?.();
            }
        } catch (error) {
            if (!settled) {
                settled = true;
                rejectStream?.(error instanceof Error ? error : new Error('Failed to process file transfer chunk'));
            }
            throw error;
        }
    });

    const unsubscribeStatus = apiSocket.onStatusChange((status) => {
        if ((status === 'disconnected' || status === 'error') && !settled) {
            settled = true;
            rejectStream?.(new Error('File transfer socket disconnected'));
        }
    });

    try {
        const params = await machineEncryption.encryptRaw({
            protocolVersion: 2,
            transferId: input.transferId,
            attemptId: input.attemptId,
            path: input.remotePath,
            offset: input.offset,
            chunkSize: input.chunkSize ?? STREAM_DOWNLOAD_CHUNK_BYTES,
            acceptsBinary: true,
            maxInFlightChunks: input.maxInFlightChunks ?? STREAM_DOWNLOAD_IN_FLIGHT_CHUNKS,
        });
        const startResponse = await apiSocket.emitWithAckTimeout<{ ok: boolean; totalSize?: number; error?: string }>(
            'file-transfer-start',
            {
                machineId: input.machineId,
                transferId: input.transferId,
                attemptId: input.attemptId,
                params,
            },
            FILE_TRANSFER_CONTROL_TIMEOUT_MS,
        );

        if (!startResponse?.ok) {
            throw new Error(startResponse?.error || 'File transfer stream is not available');
        }

        await streamPromise;
    } catch (error) {
        throw error;
    } finally {
        unsubscribe();
        unsubscribeStatus();
    }
}

export async function cancelMachineFileTransferStream(machineId: string, transferId: string, attemptId?: string): Promise<void> {
    const machineEncryption = sync.encryption.getMachineEncryption(machineId);
    if (!machineEncryption) {
        return;
    }
    const params = await machineEncryption.encryptRaw({ transferId, attemptId });
    await apiSocket.emitWithAckTimeout('file-transfer-cancel', { machineId, transferId, attemptId, params }, FILE_TRANSFER_CONTROL_TIMEOUT_MS);
}
