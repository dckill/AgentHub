import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileSystemMock = vi.hoisted(() => ({
    copyAsync: vi.fn(),
    deleteAsync: vi.fn(),
    getInfoAsync: vi.fn(),
    makeDirectoryAsync: vi.fn(),
    moveAsync: vi.fn(),
    readAsStringAsync: vi.fn(),
    writeAsStringAsync: vi.fn(),
    documentDirectory: 'file:///app/',
    EncodingType: {
        Base64: 'base64',
    },
    StorageAccessFramework: {
        createFileAsync: vi.fn(),
        deleteAsync: vi.fn(),
        writeAsStringAsync: vi.fn(),
    },
}));

const fileHandleMock = vi.hoisted(() => ({
    close: vi.fn(),
    offset: 0 as number | null,
    size: 0 as number | null,
    writeBytes: vi.fn((bytes: Uint8Array) => {
        fileHandleMock.offset = (fileHandleMock.offset ?? 0) + bytes.length;
        fileHandleMock.size = Math.max(fileHandleMock.size ?? 0, fileHandleMock.offset ?? 0);
    }),
}));

const fileApiMock = vi.hoisted(() => {
    class MockFile {
        uri: string;
        exists = false;

        constructor(uri: string) {
            this.uri = uri;
        }

        create = vi.fn(() => {
            this.exists = true;
            fileHandleMock.offset = 0;
            fileHandleMock.size = 0;
        });

        open = vi.fn(() => fileHandleMock);
    }

    return {
        File: MockFile,
    };
});

const machineReadFileMock = vi.hoisted(() => vi.fn());
const fileTransferSocketMock = vi.hoisted(() => ({
    cancelMachineFileTransferStream: vi.fn(),
    downloadMachineFileViaStream: vi.fn(),
    STREAM_DOWNLOAD_CHUNK_BYTES: 512 * 1024,
    STREAM_DOWNLOAD_IN_FLIGHT_CHUNKS: 8,
}));
const persistenceMock = vi.hoisted(() => ({
    loadFileTransferSettings: vi.fn(),
    loadFileTransferTasks: vi.fn(),
    saveFileTransferSettings: vi.fn(),
    saveFileTransferTasks: vi.fn(),
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: { attempt?: number; total?: number }) => (
        key === 'transferManager.streamRetry'
            ? `${key}:${params?.attempt}/${params?.total}`
            : key
    ),
}));

vi.mock('expo-file-system/legacy', () => fileSystemMock);

vi.mock('expo-file-system', () => fileApiMock);

vi.mock('./ops', () => ({
    machineReadFile: machineReadFileMock,
}));

vi.mock('./fileTransferSocket', () => fileTransferSocketMock);

vi.mock('./persistence', () => persistenceMock);

async function waitForDownloadToSettle() {
    await vi.waitFor(() => {
        const failedCalls = persistenceMock.saveFileTransferTasks.mock.calls
            .map(([tasks]) => tasks?.[0]?.status)
            .filter(Boolean);
        expect(failedCalls).toContain('completed');
    }, { timeout: 2500 });
}

describe('fileTransferStore', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        persistenceMock.loadFileTransferTasks.mockReturnValue([]);
        persistenceMock.loadFileTransferSettings.mockReturnValue({
            downloadDirectoryUri: 'content://com.android.externalstorage.documents/tree/primary:Download/document/primary:Download',
            downloadDirectoryLabel: 'Download',
        });
        fileHandleMock.close.mockClear();
        fileHandleMock.writeBytes.mockClear();
        fileHandleMock.offset = 0;
        fileHandleMock.size = 0;
        fileSystemMock.getInfoAsync.mockImplementation(async () => {
            const size = fileHandleMock.size ?? 0;
            return { exists: size > 0, isDirectory: false, size };
        });
        fileSystemMock.readAsStringAsync.mockResolvedValue(Buffer.from('png').toString('base64'));
        fileSystemMock.StorageAccessFramework.createFileAsync.mockResolvedValue('content://com.android.externalstorage.documents/document/primary:Download%2Fphoto.png');
        fileTransferSocketMock.downloadMachineFileViaStream.mockImplementation(async (input) => {
            await input.onChunk({
                transferId: input.transferId,
                attemptId: input.attemptId,
                offset: input.offset,
                bytesRead: 3,
                totalSize: 3,
                bytes: new Uint8Array(Buffer.from('png')),
                done: true,
            });
        });
        fileTransferSocketMock.cancelMachineFileTransferStream.mockResolvedValue(undefined);
        machineReadFileMock.mockResolvedValue({
            success: true,
            content: Buffer.from('png').toString('base64'),
            totalSize: 3,
            offset: 0,
            bytesRead: 3,
            truncated: false,
        });
    });

    it('creates a queued download without starting it when enqueued paused', async () => {
        const { useFileTransferStore } = await import('./fileTransferStore');

        const taskId = useFileTransferStore.getState().enqueueDownloadPaused({
            machineId: 'machine-a',
            remotePath: '/tmp/photo.png',
            fileName: 'photo.png',
            size: 3,
        });

        const task = useFileTransferStore.getState().tasks.find(item => item.id === taskId);
        expect(task?.status).toBe('queued');
        expect(fileTransferSocketMock.downloadMachineFileViaStream).not.toHaveBeenCalled();
    });

    it('cancels and removes all account-scoped transfers while preserving device settings', async () => {
        const { useFileTransferStore } = await import('./fileTransferStore');
        const settings = useFileTransferStore.getState().settings;
        const taskId = useFileTransferStore.getState().enqueueDownloadPaused({
            machineId: 'account-a-machine',
            remotePath: '/account-a/secret.txt',
        });

        useFileTransferStore.getState().resetAccountTasks();
        useFileTransferStore.getState().resetAccountTasks();

        expect(fileTransferSocketMock.cancelMachineFileTransferStream)
            .toHaveBeenCalledWith('account-a-machine', taskId);
        expect(useFileTransferStore.getState().tasks).toEqual([]);
        expect(useFileTransferStore.getState().settings).toBe(settings);
        expect(persistenceMock.saveFileTransferTasks).toHaveBeenLastCalledWith([]);
    });

    it('requires an Android SAF directory before direct downloads are considered system-visible', async () => {
        const { hasSystemDownloadDirectory } = await import('./fileTransferStore');

        expect(hasSystemDownloadDirectory({})).toBe(false);
        expect(hasSystemDownloadDirectory({
            downloadDirectoryUri: 'file:///app/downloads/',
            downloadDirectoryLabel: 'App',
        })).toBe(false);
        expect(hasSystemDownloadDirectory({
            downloadDirectoryUri: 'content://com.android.externalstorage.documents/tree/primary:Download',
            downloadDirectoryLabel: 'Download',
        })).toBe(true);
    });

    it('persists the delete-local-file preference with transfer settings', async () => {
        const { useFileTransferStore } = await import('./fileTransferStore');

        useFileTransferStore.getState().setDeleteLocalFileOnRemove(true);
        expect(persistenceMock.saveFileTransferSettings).toHaveBeenLastCalledWith(expect.objectContaining({
            deleteLocalFileOnRemove: true,
        }));

        useFileTransferStore.getState().setDownloadDirectory({
            downloadDirectoryUri: 'content://com.android.externalstorage.documents/tree/primary:Pictures',
            downloadDirectoryLabel: 'Pictures',
        });
        expect(persistenceMock.saveFileTransferSettings).toHaveBeenLastCalledWith({
            downloadDirectoryUri: 'content://com.android.externalstorage.documents/tree/primary:Pictures',
            downloadDirectoryLabel: 'Pictures',
            deleteLocalFileOnRemove: true,
        });
    });

    it('writes completed downloads to SAF directories without FileSystem.copyAsync', async () => {
        const { useFileTransferStore } = await import('./fileTransferStore');

        useFileTransferStore.getState().enqueueDownload({
            machineId: 'machine-a',
            remotePath: '/tmp/photo.png',
            fileName: 'photo.png',
            size: 3,
        });

        await waitForDownloadToSettle();

        expect(fileTransferSocketMock.downloadMachineFileViaStream).toHaveBeenCalled();
        expect(fileTransferSocketMock.downloadMachineFileViaStream).toHaveBeenCalledWith(expect.objectContaining({
            chunkSize: 512 * 1024,
            maxInFlightChunks: 8,
        }));
        expect(machineReadFileMock).not.toHaveBeenCalled();
        expect(fileSystemMock.copyAsync).not.toHaveBeenCalled();
        expect(fileHandleMock.writeBytes).toHaveBeenCalledWith(new Uint8Array(Buffer.from('png')));
        expect(fileSystemMock.writeAsStringAsync.mock.calls.some(([uri]) => String(uri).includes('.part'))).toBe(false);
        expect(fileSystemMock.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
            'content://com.android.externalstorage.documents/document/primary:Download%2Fphoto.png',
            Buffer.from('png').toString('base64'),
            { append: false, encoding: 'base64' },
        );
        expect(fileSystemMock.deleteAsync).toHaveBeenCalledWith(
            expect.stringContaining('.part'),
            { idempotent: true },
        );
    });

    it('retries stream downloads from the partial file size after a mid-transfer disconnect', async () => {
        fileSystemMock.getInfoAsync.mockReset();
        fileSystemMock.getInfoAsync
            .mockResolvedValueOnce({ exists: false, isDirectory: false, size: 0 })
            .mockResolvedValueOnce({ exists: true, isDirectory: false, size: 2 })
            .mockResolvedValue({ exists: true, isDirectory: false, size: 3 });
        fileTransferSocketMock.downloadMachineFileViaStream
            .mockImplementationOnce(async (input) => {
                await input.onChunk({
                    transferId: input.transferId,
                    attemptId: input.attemptId,
                    offset: 0,
                    bytesRead: 2,
                    totalSize: 3,
                    bytes: new Uint8Array(Buffer.from('pn')),
                    done: false,
                });
                throw new Error('File transfer socket disconnected');
            })
            .mockImplementationOnce(async (input) => {
                await input.onChunk({
                    transferId: input.transferId,
                    attemptId: input.attemptId,
                    offset: input.offset,
                    bytesRead: 1,
                    totalSize: 3,
                    bytes: new Uint8Array(Buffer.from('g')),
                    done: true,
                });
            });

        const { useFileTransferStore } = await import('./fileTransferStore');

        useFileTransferStore.getState().enqueueDownload({
            machineId: 'machine-a',
            remotePath: '/tmp/photo.png',
            fileName: 'photo.png',
            size: 3,
        });

        await waitForDownloadToSettle();

        expect(fileTransferSocketMock.downloadMachineFileViaStream).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ offset: 0 }),
        );
        expect(fileTransferSocketMock.downloadMachineFileViaStream).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ offset: 2 }),
        );
        expect(fileTransferSocketMock.downloadMachineFileViaStream.mock.calls[0][0].attemptId).not.toBe(
            fileTransferSocketMock.downloadMachineFileViaStream.mock.calls[1][0].attemptId,
        );
        expect(machineReadFileMock).not.toHaveBeenCalled();
    });

    it('removes only the transfer record by default', async () => {
        persistenceMock.loadFileTransferTasks.mockReturnValue([{
            id: 'task-a',
            machineId: 'machine-a',
            direction: 'download',
            remotePath: '/tmp/photo.png',
            fileName: 'photo.png',
            localUri: 'file:///app/downloads/machine-a/task-a-photo.png',
            status: 'completed',
            downloadedBytes: 3,
            totalBytes: 3,
            createdAt: 1,
            updatedAt: 2,
            completedAt: 3,
        }]);
        const { useFileTransferStore } = await import('./fileTransferStore');

        const result = await useFileTransferStore.getState().removeTask('task-a');

        expect(result).toEqual({ removed: true, localFileDeleted: false });
        expect(fileSystemMock.deleteAsync).not.toHaveBeenCalledWith(
            'file:///app/downloads/machine-a/task-a-photo.png',
            expect.anything(),
        );
        expect(useFileTransferStore.getState().tasks).toEqual([]);
    });

    it('can delete the downloaded file when removing a transfer record', async () => {
        persistenceMock.loadFileTransferTasks.mockReturnValue([{
            id: 'task-a',
            machineId: 'machine-a',
            direction: 'download',
            remotePath: '/tmp/photo.png',
            fileName: 'photo.png',
            localUri: 'file:///app/downloads/machine-a/task-a-photo.png',
            status: 'completed',
            downloadedBytes: 3,
            totalBytes: 3,
            createdAt: 1,
            updatedAt: 2,
            completedAt: 3,
        }]);
        const { useFileTransferStore } = await import('./fileTransferStore');

        const result = await useFileTransferStore.getState().removeTask('task-a', { deleteLocalFile: true });

        expect(result).toEqual({ removed: true, localFileDeleted: true });
        expect(fileSystemMock.deleteAsync).toHaveBeenCalledWith(
            'file:///app/downloads/machine-a/task-a-photo.png',
            { idempotent: true },
        );
        expect(useFileTransferStore.getState().tasks).toEqual([]);
    });

    it('uses SAF deletion for downloaded content uris', async () => {
        persistenceMock.loadFileTransferTasks.mockReturnValue([{
            id: 'task-a',
            machineId: 'machine-a',
            direction: 'download',
            remotePath: '/tmp/photo.png',
            fileName: 'photo.png',
            localUri: 'content://com.android.externalstorage.documents/document/primary:Download%2Fphoto.png',
            status: 'completed',
            downloadedBytes: 3,
            totalBytes: 3,
            createdAt: 1,
            updatedAt: 2,
            completedAt: 3,
        }]);
        const { useFileTransferStore } = await import('./fileTransferStore');

        await useFileTransferStore.getState().removeTask('task-a', { deleteLocalFile: true });

        expect(fileSystemMock.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(
            'content://com.android.externalstorage.documents/document/primary:Download%2Fphoto.png',
            { idempotent: true },
        );
        expect(fileSystemMock.deleteAsync).not.toHaveBeenCalledWith(
            'content://com.android.externalstorage.documents/document/primary:Download%2Fphoto.png',
            expect.anything(),
        );
    });
});
