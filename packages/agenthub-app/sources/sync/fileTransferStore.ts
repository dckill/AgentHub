import { create } from 'zustand';
import { t } from '@/text';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile, type FileHandle } from 'expo-file-system';
import {
    cancelMachineFileTransferStream,
    downloadMachineFileViaStream,
    STREAM_DOWNLOAD_CHUNK_BYTES,
    STREAM_DOWNLOAD_IN_FLIGHT_CHUNKS,
    type FileTransferStreamChunk,
} from '@/sync/fileTransferSocket';
import {
    loadFileTransferSettings,
    loadFileTransferTasks,
    saveFileTransferSettings,
    saveFileTransferTasks,
} from '@/sync/persistence';
import {
    buildTransferSummary,
    getCompletedTransferTaskIds,
    getDownloadDirectoryLabel,
    getFileNameStem,
    getMimeTypeForFileName,
    type FileTransferSettings,
    type FileTransferStatus,
    type FileTransferTask,
    type TransferSummary,
    type TransferTaskFilter,
} from '@/utils/fileTransfers';

const SAF_WRITE_CHUNK_BYTES = 2 * 1024 * 1024;
const STREAM_DOWNLOAD_MAX_ATTEMPTS = 8;
const STREAM_DOWNLOAD_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const STREAM_DOWNLOAD_PENDING_WRITE_CHUNKS = 16;

export interface EnqueueDownloadInput {
    machineId: string;
    sessionId?: string;
    remotePath: string;
    fileName?: string;
    size?: number;
    modified?: number;
}

interface FileTransferState {
    tasks: FileTransferTask[];
    settings: FileTransferSettings;
    enqueueDownload: (input: EnqueueDownloadInput) => string;
    enqueueDownloadPaused: (input: EnqueueDownloadInput) => string;
    startDownload: (taskId: string) => void;
    pauseTask: (taskId: string) => void;
    cancelTask: (taskId: string) => void;
    retryTask: (taskId: string) => void;
    removeTask: (taskId: string, options?: { deleteLocalFile?: boolean }) => Promise<{ removed: boolean; localFileDeleted: boolean }>;
    clearCompletedTasks: (filter: TransferTaskFilter) => number;
    resetAccountTasks: () => void;
    setDownloadDirectory: (settings: FileTransferSettings) => void;
    setDeleteLocalFileOnRemove: (deleteLocalFileOnRemove: boolean) => void;
    getTaskForRemoteFile: (machineId: string, remotePath: string) => FileTransferTask | null;
}

function normalizeLoadedTasks(tasks: FileTransferTask[]): FileTransferTask[] {
    return tasks.map(task => {
        if (task.status === 'downloading' || task.status === 'queued') {
            return { ...task, status: 'paused', updatedAt: Date.now() };
        }
        return task;
    });
}

function persistTasks(tasks: FileTransferTask[]) {
    saveFileTransferTasks(tasks);
}

function getBaseName(path: string): string {
    return path.split(/[\\/]/).pop() || path || 'download';
}

function safeFileName(fileName: string): string {
    const trimmed = fileName.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
    return trimmed || 'download';
}

function makeTransferId(): string {
    return `transfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTransferAttemptId(transferId: string): string {
    return `${transferId}-attempt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getTransferRootDirectoryUri(): string {
    const root = FileSystem.documentDirectory;
    if (!root) {
        throw new Error('Document directory is not available on this platform.');
    }
    return `${root}downloads/`;
}

export function getTransferDirectoryUri(machineId: string): string {
    const root = getTransferRootDirectoryUri();
    return `${root}${encodeURIComponent(machineId)}/`;
}

export function hasSystemDownloadDirectory(settings: FileTransferSettings): boolean {
    return Platform.OS !== 'android' || isSafDirectory(settings);
}

function getTransferFileUris(task: FileTransferTask): { localUri: string; tempUri: string } {
    const directory = getTransferDirectoryUri(task.machineId);
    const fileName = `${task.id}-${safeFileName(task.fileName)}`;
    const localUri = `${directory}${fileName}`;
    return {
        localUri,
        tempUri: `${localUri}.part`,
    };
}

function isDownloadActive(status: FileTransferStatus): boolean {
    return status === 'queued' || status === 'downloading';
}

function isSafDirectory(settings: FileTransferSettings): settings is Required<Pick<FileTransferSettings, 'downloadDirectoryUri'>> & FileTransferSettings {
    return Platform.OS === 'android'
        && typeof settings.downloadDirectoryUri === 'string'
        && settings.downloadDirectoryUri.startsWith('content://');
}

async function copyTempFileToSafDirectory(tempUri: string, task: FileTransferTask, directoryUri: string): Promise<string> {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        directoryUri,
        getFileNameStem(safeFileName(task.fileName)),
        getMimeTypeForFileName(task.fileName),
    );
    const tempInfo = await FileSystem.getInfoAsync(tempUri);
    const tempSize = tempInfo.exists && !tempInfo.isDirectory ? tempInfo.size : 0;
    let offset = 0;
    let append = false;

    if (tempSize === 0) {
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, '', {
            append: false,
            encoding: FileSystem.EncodingType.Base64,
        });
    }

    while (offset < tempSize) {
        const length = Math.min(SAF_WRITE_CHUNK_BYTES, tempSize - offset);
        const content = await FileSystem.readAsStringAsync(tempUri, {
            encoding: FileSystem.EncodingType.Base64,
            position: offset,
            length,
        });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, content, {
            append,
            encoding: FileSystem.EncodingType.Base64,
        });
        append = true;
        offset += length;
    }

    await FileSystem.deleteAsync(tempUri, { idempotent: true });
    return fileUri;
}

async function finalizeDownloadedFile(
    tempUri: string,
    privateLocalUri: string,
    task: FileTransferTask,
    settings: FileTransferSettings,
): Promise<{ localUri: string; localDirectoryUri: string; localDirectoryLabel: string }> {
    if (isSafDirectory(settings)) {
        const localUri = await copyTempFileToSafDirectory(tempUri, task, settings.downloadDirectoryUri);
        return {
            localUri,
            localDirectoryUri: settings.downloadDirectoryUri,
            localDirectoryLabel: getDownloadDirectoryLabel(settings, t('transferManager.appPrivateDirectory')),
        };
    }

    await FileSystem.moveAsync({ from: tempUri, to: privateLocalUri });
    return {
        localUri: privateLocalUri,
        localDirectoryUri: getTransferDirectoryUri(task.machineId),
        localDirectoryLabel: getDownloadDirectoryLabel(settings, t('transferManager.appPrivateDirectory')),
    };
}

function updateTask(
    set: (partial: Partial<FileTransferState> | ((state: FileTransferState) => Partial<FileTransferState>)) => void,
    taskId: string,
    updater: (task: FileTransferTask) => FileTransferTask,
) {
    set((state) => {
        const tasks = state.tasks.map(task => task.id === taskId ? updater(task) : task);
        persistTasks(tasks);
        return { tasks };
    });
}

async function ensureDownloadDirectory(task: FileTransferTask) {
    await FileSystem.makeDirectoryAsync(getTransferDirectoryUri(task.machineId), { intermediates: true });
}

async function deleteTransferFile(uri: string): Promise<void> {
    if (uri.startsWith('content://')) {
        await FileSystem.StorageAccessFramework.deleteAsync(uri, { idempotent: true });
        return;
    }
    await FileSystem.deleteAsync(uri, { idempotent: true });
}

async function getExistingTempSize(tempUri: string): Promise<number> {
    const info = await FileSystem.getInfoAsync(tempUri);
    return info.exists && !info.isDirectory ? info.size : 0;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function closeFileHandle(handle: FileHandle | null) {
    if (!handle) {
        return;
    }
    try {
        handle.close();
    } catch {
        // The native handle can already be closed after a failed write.
    }
}

function openTempFileHandle(tempUri: string, offset: number): FileHandle {
    const file = new ExpoFile(tempUri);
    if (offset === 0 || !file.exists) {
        file.create({ overwrite: offset === 0, intermediates: true });
    }
    const handle = file.open();
    handle.offset = offset;
    return handle;
}

async function runDownloadTask(
    taskId: string,
    get: () => FileTransferState,
    set: (partial: Partial<FileTransferState> | ((state: FileTransferState) => Partial<FileTransferState>)) => void,
) {
    const initialTask = get().tasks.find(task => task.id === taskId);
    if (!initialTask) {
        return;
    }

    const uris = getTransferFileUris(initialTask);
    await ensureDownloadDirectory(initialTask);

    let offset = await getExistingTempSize(uris.tempUri);
    const knownTotal = initialTask.totalBytes ?? initialTask.size;
    if (knownTotal !== undefined && offset > knownTotal) {
        await FileSystem.deleteAsync(uris.tempUri, { idempotent: true });
        offset = 0;
    }

    updateTask(set, taskId, task => ({
        ...task,
        status: 'downloading',
        localUri: isSafDirectory(get().settings) ? undefined : uris.localUri,
        localDirectoryUri: isSafDirectory(get().settings) ? get().settings.downloadDirectoryUri : getTransferDirectoryUri(task.machineId),
        localDirectoryLabel: getDownloadDirectoryLabel(get().settings, t('transferManager.appPrivateDirectory')),
        tempUri: uris.tempUri,
        downloadedBytes: offset,
        totalBytes: task.totalBytes ?? task.size,
        error: undefined,
        updatedAt: Date.now(),
    }));

    const updateProgress = (totalBytes: number) => {
        updateTask(set, taskId, task => ({
            ...task,
            status: 'downloading',
            localUri: isSafDirectory(get().settings) ? undefined : uris.localUri,
            localDirectoryUri: isSafDirectory(get().settings) ? get().settings.downloadDirectoryUri : getTransferDirectoryUri(task.machineId),
            localDirectoryLabel: getDownloadDirectoryLabel(get().settings, t('transferManager.appPrivateDirectory')),
            tempUri: uris.tempUri,
            downloadedBytes: offset,
            totalBytes,
            updatedAt: Date.now(),
        }));
    };

    const isTaskStopped = () => {
        const current = get().tasks.find(task => task.id === taskId);
        return !current || current.status === 'paused' || current.status === 'cancelled';
    };

    const createOrderedChunkWriter = (startOffset: number) => {
        type PendingChunk = {
            chunk: FileTransferStreamChunk;
        };

        const pending = new Map<number, PendingChunk>();
        const handle = openTempFileHandle(uris.tempUri, startOffset);
        let nextOffset = startOffset;
        let draining: Promise<void> | null = null;
        let failed: Error | null = null;
        let completed: { totalBytes: number; task: FileTransferTask } | null = null;
        const waiters = new Set<() => void>();

        const notifyWaiters = () => {
            for (const resolve of waiters) {
                resolve();
            }
            waiters.clear();
        };

        const waitForChange = async () => {
            if (failed) {
                throw failed;
            }
            await new Promise<void>(resolve => waiters.add(resolve));
            if (failed) {
                throw failed;
            }
        };

        const rejectAll = (error: Error) => {
            failed = error;
            pending.clear();
            notifyWaiters();
        };

        const drain = () => {
            if (draining) {
                return draining;
            }

            const currentDrain = Promise.resolve().then(async () => {
                try {
                    while (true) {
                        const item = pending.get(nextOffset);
                        if (!item) {
                            return;
                        }
                        pending.delete(nextOffset);

                        const current = get().tasks.find(task => task.id === taskId);
                        if (!current || current.status === 'paused' || current.status === 'cancelled') {
                            throw new Error('File transfer is no longer active.');
                        }

                        const { chunk } = item;
                        if (chunk.offset !== nextOffset) {
                            throw new Error('Remote file transfer returned an unexpected chunk offset.');
                        }
                        if (chunk.bytesRead > 0) {
                            handle.offset = chunk.offset;
                            handle.writeBytes(chunk.bytes);
                        }

                        nextOffset += chunk.bytesRead;
                        offset = nextOffset;
                        updateProgress(chunk.totalSize);
                        if (chunk.done) {
                            completed = { totalBytes: chunk.totalSize, task: current };
                        }
                        notifyWaiters();
                    }
                } catch (error) {
                    rejectAll(error instanceof Error ? error : new Error('Failed to write file transfer chunk'));
                } finally {
                    if (draining === currentDrain) {
                        draining = null;
                    }
                    notifyWaiters();
                    if (!failed && pending.has(nextOffset)) {
                        void drain();
                    }
                }
            });
            draining = currentDrain;

            return draining;
        };

        return {
            accept: async (chunk: FileTransferStreamChunk) => {
                if (failed) {
                    throw failed;
                }
                if (chunk.offset < nextOffset) {
                    if (chunk.offset + chunk.bytesRead <= nextOffset) {
                        return;
                    }
                    throw new Error('Remote file transfer returned an overlapping chunk.');
                }
                const existing = pending.get(chunk.offset);
                if (existing) {
                    return;
                }

                while (pending.size >= STREAM_DOWNLOAD_PENDING_WRITE_CHUNKS) {
                    await waitForChange();
                }
                if (failed) {
                    throw failed;
                }
                pending.set(chunk.offset, { chunk });
                void drain();
            },
            waitForIdle: async () => {
                while (!failed && (pending.size > 0 || draining)) {
                    await waitForChange();
                }
                if (failed) {
                    throw failed;
                }
            },
            getCompleted: () => completed,
            cancel: (error: Error) => rejectAll(error),
            close: () => closeFileHandle(handle),
        };
    };

    const completeDownload = async (totalBytes: number, current: FileTransferTask) => {
        const destination = await finalizeDownloadedFile(uris.tempUri, uris.localUri, current, get().settings);
        updateTask(set, taskId, task => ({
            ...task,
            status: 'completed',
            localUri: destination.localUri,
            localDirectoryUri: destination.localDirectoryUri,
            localDirectoryLabel: destination.localDirectoryLabel,
            tempUri: undefined,
            downloadedBytes: totalBytes,
            totalBytes,
            error: undefined,
            completedAt: Date.now(),
            updatedAt: Date.now(),
        }));
    };

    for (let attempt = 0; attempt < STREAM_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
        if (isTaskStopped()) {
            return;
        }

        updateProgress(knownTotal ?? initialTask.totalBytes ?? initialTask.size ?? offset);
        const writer = createOrderedChunkWriter(offset);
        const attemptId = makeTransferAttemptId(taskId);

        try {
            await downloadMachineFileViaStream({
                machineId: initialTask.machineId,
                transferId: taskId,
                attemptId,
                remotePath: initialTask.remotePath,
                offset,
                chunkSize: STREAM_DOWNLOAD_CHUNK_BYTES,
                maxInFlightChunks: STREAM_DOWNLOAD_IN_FLIGHT_CHUNKS,
                onChunk: writer.accept,
            });
            await writer.waitForIdle();
            const completed = writer.getCompleted();
            writer.close();
            if (!completed) {
                throw new Error('File transfer stream ended before completion.');
            }
            await completeDownload(completed.totalBytes, completed.task);
            return;
        } catch (error) {
            writer.cancel(error instanceof Error ? error : new Error('Download failed.'));
            writer.close();
            if (isTaskStopped()) {
                return;
            }

            offset = await getExistingTempSize(uris.tempUri);
            const message = error instanceof Error ? error.message : 'Download failed.';
            if (attempt >= STREAM_DOWNLOAD_MAX_ATTEMPTS - 1) {
                throw new Error(message);
            }

            updateTask(set, taskId, task => ({
                ...task,
                status: 'downloading',
                downloadedBytes: offset,
                error: t('transferManager.streamRetry', {
                    attempt: attempt + 1,
                    total: STREAM_DOWNLOAD_MAX_ATTEMPTS - 1,
                }),
                updatedAt: Date.now(),
            }));
            await delay(STREAM_DOWNLOAD_RETRY_DELAYS_MS[Math.min(attempt, STREAM_DOWNLOAD_RETRY_DELAYS_MS.length - 1)]);
        }
    }
}

const initialTasks = normalizeLoadedTasks(loadFileTransferTasks());
const initialSettings = loadFileTransferSettings();
persistTasks(initialTasks);

export const useFileTransferStore = create<FileTransferState>()((set, get) => ({
    tasks: initialTasks,
    settings: initialSettings,

    enqueueDownloadPaused: (input) => {
        const existing = get().getTaskForRemoteFile(input.machineId, input.remotePath);
        if (existing && existing.status !== 'completed' && existing.status !== 'cancelled') {
            return existing.id;
        }

        const now = Date.now();
        const id = makeTransferId();
        const fileName = input.fileName || getBaseName(input.remotePath);
        const task: FileTransferTask = {
            id,
            machineId: input.machineId,
            sessionId: input.sessionId,
            direction: 'download',
            remotePath: input.remotePath,
            fileName,
            status: 'queued',
            downloadedBytes: 0,
            totalBytes: input.size,
            size: input.size,
            modified: input.modified,
            createdAt: now,
            updatedAt: now,
        };

        set((state) => {
            const tasks = [task, ...state.tasks];
            persistTasks(tasks);
            return { tasks };
        });
        return id;
    },
    enqueueDownload: (input) => {
        const id = get().enqueueDownloadPaused(input);
        const existing = get().tasks.find(task => task.id === id);
        if (existing && existing.status !== 'downloading' && existing.status !== 'completed' && existing.status !== 'cancelled') {
            get().startDownload(id);
        }
        return id;
    },

    startDownload: (taskId) => {
        const task = get().tasks.find(item => item.id === taskId);
        if (!task || task.status === 'downloading' || task.status === 'completed' || task.status === 'cancelled') {
            return;
        }

        updateTask(set, taskId, item => ({
            ...item,
            status: 'queued',
            error: undefined,
            updatedAt: Date.now(),
        }));

        runDownloadTask(taskId, get, set).catch((error) => {
            const current = get().tasks.find(item => item.id === taskId);
            if (!current || current.status === 'cancelled' || current.status === 'paused') {
                return;
            }
            updateTask(set, taskId, item => ({
                ...item,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Download failed.',
                updatedAt: Date.now(),
            }));
        });
    },

    pauseTask: (taskId) => {
        const task = get().tasks.find(item => item.id === taskId);
        if (task) {
            cancelMachineFileTransferStream(task.machineId, task.id).catch(() => {});
        }
        updateTask(set, taskId, task => isDownloadActive(task.status)
            ? { ...task, status: 'paused', updatedAt: Date.now() }
            : task);
    },

    cancelTask: (taskId) => {
        const task = get().tasks.find(item => item.id === taskId);
        if (task) {
            cancelMachineFileTransferStream(task.machineId, task.id).catch(() => {});
        }
        if (task?.tempUri) {
            FileSystem.deleteAsync(task.tempUri, { idempotent: true }).catch(() => {});
        }
        updateTask(set, taskId, item => ({
            ...item,
            status: 'cancelled',
            updatedAt: Date.now(),
        }));
    },

    retryTask: (taskId) => {
        const task = get().tasks.find(item => item.id === taskId);
        if (!task || task.status === 'downloading' || task.status === 'completed') {
            return;
        }
        get().startDownload(taskId);
    },

    removeTask: async (taskId, options) => {
        const task = get().tasks.find(item => item.id === taskId);
        let localFileDeleted = false;
        if (options?.deleteLocalFile && task?.localUri) {
            await deleteTransferFile(task.localUri);
            localFileDeleted = true;
        }
        if (task?.tempUri) {
            FileSystem.deleteAsync(task.tempUri, { idempotent: true }).catch(() => {});
        }
        set((state) => {
            const tasks = state.tasks.filter(item => item.id !== taskId);
            persistTasks(tasks);
            return { tasks };
        });
        return {
            removed: Boolean(task),
            localFileDeleted,
        };
    },

    clearCompletedTasks: (filter) => {
        const ids = new Set(getCompletedTransferTaskIds(get().tasks, filter));
        if (ids.size === 0) {
            return 0;
        }
        set((state) => {
            const tasks = state.tasks.filter(item => !ids.has(item.id));
            persistTasks(tasks);
            return { tasks };
        });
        return ids.size;
    },

    resetAccountTasks: () => {
        const tasks = get().tasks;
        for (const task of tasks) {
            if (isDownloadActive(task.status)) {
                cancelMachineFileTransferStream(task.machineId, task.id).catch(() => {});
            }
        }
        persistTasks([]);
        set({ tasks: [] });
    },

    setDownloadDirectory: (settings) => {
        const nextSettings: FileTransferSettings = {
            downloadDirectoryUri: settings.downloadDirectoryUri,
            downloadDirectoryLabel: settings.downloadDirectoryLabel,
            deleteLocalFileOnRemove: get().settings.deleteLocalFileOnRemove,
        };
        saveFileTransferSettings(nextSettings);
        set({ settings: nextSettings });
    },

    setDeleteLocalFileOnRemove: (deleteLocalFileOnRemove) => {
        const nextSettings: FileTransferSettings = {
            ...get().settings,
            deleteLocalFileOnRemove,
        };
        saveFileTransferSettings(nextSettings);
        set({ settings: nextSettings });
    },

    getTaskForRemoteFile: (machineId, remotePath) => {
        return get().tasks.find(task => task.machineId === machineId && task.remotePath === remotePath) ?? null;
    },
}));

export function useTransferSummary(): TransferSummary {
    const tasks = useFileTransferStore(state => state.tasks);
    return buildTransferSummary(tasks);
}
