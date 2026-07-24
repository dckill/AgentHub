export type FileTransferStatus =
    | 'queued'
    | 'downloading'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

export type FileTransferDirection = 'download';

export interface FileTransferTask {
    id: string;
    machineId: string;
    sessionId?: string;
    direction: FileTransferDirection;
    remotePath: string;
    fileName: string;
    localUri?: string;
    localDirectoryUri?: string;
    localDirectoryLabel?: string;
    tempUri?: string;
    status: FileTransferStatus;
    downloadedBytes: number;
    totalBytes?: number;
    size?: number;
    modified?: number;
    error?: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
}

export interface TransferCounterSummary {
    activeCount: number;
    failedCount: number;
    pausedCount: number;
    queuedCount: number;
    completedRecentCount: number;
    completedCount: number;
    cancelledCount: number;
    totalCount: number;
}

export interface MachineTransferSummary extends TransferCounterSummary {
    machineId: string;
    latestError?: string;
    totalProgress?: number;
}

export interface TransferSummary {
    global: TransferCounterSummary;
    byMachine: Record<string, MachineTransferSummary>;
}

export type MachineTransferBadge =
    | { tone: 'error'; label: string; accessibilityLabel: string }
    | { tone: 'active'; label: string; accessibilityLabel: string }
    | { tone: 'paused'; label: string; accessibilityLabel: string }
    | { tone: 'done'; label: string; accessibilityLabel: string };

export interface TransferTaskFilter {
    machineId?: string | null;
    status?: FileTransferStatus | 'active' | null;
}

export interface FileTransferSettings {
    downloadDirectoryUri?: string;
    downloadDirectoryLabel?: string;
    deleteLocalFileOnRemove?: boolean;
}

const FILE_TRANSFER_STATUSES = new Set<FileTransferStatus>([
    'queued',
    'downloading',
    'paused',
    'completed',
    'failed',
    'cancelled',
]);

const RECENT_COMPLETION_WINDOW_MS = 60_000;

export function isFileTransferStatus(value: unknown): value is FileTransferStatus {
    return typeof value === 'string' && FILE_TRANSFER_STATUSES.has(value as FileTransferStatus);
}

function emptyCounterSummary(): TransferCounterSummary {
    return {
        activeCount: 0,
        failedCount: 0,
        pausedCount: 0,
        queuedCount: 0,
        completedRecentCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        totalCount: 0,
    };
}

function emptyMachineSummary(machineId: string): MachineTransferSummary {
    return {
        machineId,
        ...emptyCounterSummary(),
    };
}

function isRecentCompletion(task: FileTransferTask, now: number): boolean {
    return task.status === 'completed'
        && typeof task.completedAt === 'number'
        && now - task.completedAt <= RECENT_COMPLETION_WINDOW_MS;
}

function countTask(summary: TransferCounterSummary, task: FileTransferTask, now: number): void {
    summary.totalCount += 1;
    switch (task.status) {
        case 'queued':
            summary.queuedCount += 1;
            summary.activeCount += 1;
            break;
        case 'downloading':
            summary.activeCount += 1;
            break;
        case 'paused':
            summary.pausedCount += 1;
            break;
        case 'failed':
            summary.failedCount += 1;
            break;
        case 'completed':
            summary.completedCount += 1;
            if (isRecentCompletion(task, now)) {
                summary.completedRecentCount += 1;
            }
            break;
        case 'cancelled':
            summary.cancelledCount += 1;
            break;
    }
}

function computeMachineProgress(tasks: FileTransferTask[]): number | undefined {
    let downloaded = 0;
    let total = 0;
    for (const task of tasks) {
        if (task.status !== 'queued' && task.status !== 'downloading' && task.status !== 'paused') {
            continue;
        }
        if (typeof task.totalBytes !== 'number' || task.totalBytes <= 0) {
            continue;
        }
        downloaded += Math.max(0, task.downloadedBytes);
        total += task.totalBytes;
    }
    if (total <= 0) {
        return undefined;
    }
    return Math.max(0, Math.min(1, downloaded / total));
}

export function buildTransferSummary(tasks: FileTransferTask[], now: number = Date.now()): TransferSummary {
    const global = emptyCounterSummary();
    const byMachine: Record<string, MachineTransferSummary> = {};
    const tasksByMachine: Record<string, FileTransferTask[]> = {};

    for (const task of tasks) {
        countTask(global, task, now);
        byMachine[task.machineId] ??= emptyMachineSummary(task.machineId);
        tasksByMachine[task.machineId] ??= [];
        tasksByMachine[task.machineId].push(task);
        countTask(byMachine[task.machineId], task, now);
        if (task.status === 'failed' && task.error) {
            byMachine[task.machineId].latestError = task.error;
        }
    }

    for (const [machineId, machineTasks] of Object.entries(tasksByMachine)) {
        byMachine[machineId].totalProgress = computeMachineProgress(machineTasks);
    }

    return { global, byMachine };
}

export function getMachineTransferBadge(summary?: MachineTransferSummary | null): MachineTransferBadge | null {
    if (!summary || summary.totalCount === 0) {
        return null;
    }
    if (summary.failedCount > 0) {
        return {
            tone: 'error',
            label: `! ${summary.failedCount}`,
            accessibilityLabel: `${summary.failedCount} failed transfer${summary.failedCount === 1 ? '' : 's'}`,
        };
    }
    if (summary.activeCount > 0) {
        return {
            tone: 'active',
            label: `↓ ${summary.activeCount}`,
            accessibilityLabel: `${summary.activeCount} active transfer${summary.activeCount === 1 ? '' : 's'}`,
        };
    }
    if (summary.pausedCount > 0) {
        return {
            tone: 'paused',
            label: `Ⅱ ${summary.pausedCount}`,
            accessibilityLabel: `${summary.pausedCount} paused transfer${summary.pausedCount === 1 ? '' : 's'}`,
        };
    }
    if (summary.completedRecentCount > 0) {
        return {
            tone: 'done',
            label: `✓ ${summary.completedRecentCount}`,
            accessibilityLabel: `${summary.completedRecentCount} recently completed transfer${summary.completedRecentCount === 1 ? '' : 's'}`,
        };
    }
    return null;
}

export function filterTransferTasks(tasks: FileTransferTask[], filter: TransferTaskFilter): FileTransferTask[] {
    return tasks.filter((task) => {
        if (filter.machineId && task.machineId !== filter.machineId) {
            return false;
        }
        if (!filter.status) {
            return true;
        }
        if (filter.status === 'active') {
            return task.status === 'queued' || task.status === 'downloading';
        }
        return task.status === filter.status;
    });
}

export function findTransferTaskById(
    tasks: FileTransferTask[],
    taskId: string | string[] | undefined,
): FileTransferTask | null {
    const requestedIds = Array.isArray(taskId) ? taskId : taskId ? [taskId] : [];
    for (const requestedId of requestedIds) {
        const task = tasks.find(candidate => candidate.id === requestedId);
        if (task) {
            return task;
        }
    }
    return null;
}

export function getCompletedTransferTaskIds(tasks: FileTransferTask[], filter: TransferTaskFilter): string[] {
    const scopedTasks = filterTransferTasks(tasks, filter);
    return scopedTasks
        .filter(task => task.status === 'completed')
        .map(task => task.id);
}

export function getTransferDisplayName(task: Pick<FileTransferTask, 'fileName' | 'remotePath'>): string {
    return task.fileName || task.remotePath.split(/[\\/]/).pop() || task.remotePath;
}

export function getDownloadDirectoryLabel(settings: FileTransferSettings, fallbackLabel: string): string {
    return settings.downloadDirectoryLabel?.trim() || fallbackLabel;
}

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    json: 'application/json',
    pdf: 'application/pdf',
    csv: 'text/csv',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    apk: 'application/vnd.android.package-archive',
};

export function getMimeTypeForFileName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension || extension === fileName.toLowerCase()) {
        return 'application/octet-stream';
    }
    return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function getFileNameStem(fileName: string): string {
    const trimmed = fileName.trim();
    const dotIndex = trimmed.lastIndexOf('.');
    if (dotIndex <= 0) {
        return trimmed || 'download';
    }
    return trimmed.slice(0, dotIndex) || 'download';
}

export function formatTransferBytes(bytes?: number): string {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
        return '--';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getTransferProgress(task: Pick<FileTransferTask, 'downloadedBytes' | 'totalBytes'>): number {
    if (!task.totalBytes || task.totalBytes <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(1, task.downloadedBytes / task.totalBytes));
}
