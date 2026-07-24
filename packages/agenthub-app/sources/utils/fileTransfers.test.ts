import { describe, expect, it } from 'vitest';
import {
    buildTransferSummary,
    filterTransferTasks,
    findTransferTaskById,
    getCompletedTransferTaskIds,
    getDownloadDirectoryLabel,
    getMachineTransferBadge,
    getMimeTypeForFileName,
    isFileTransferStatus,
    type FileTransferTask,
} from './fileTransfers';

const now = 1_700_000_000_000;

function task(overrides: Partial<FileTransferTask>): FileTransferTask {
    return {
        id: overrides.id ?? 'task',
        machineId: overrides.machineId ?? 'machine-a',
        direction: 'download',
        remotePath: overrides.remotePath ?? '/repo/file.txt',
        fileName: overrides.fileName ?? 'file.txt',
        localUri: overrides.localUri,
        tempUri: overrides.tempUri,
        status: overrides.status ?? 'queued',
        downloadedBytes: overrides.downloadedBytes ?? 0,
        totalBytes: overrides.totalBytes,
        size: overrides.size,
        modified: overrides.modified,
        error: overrides.error,
        createdAt: overrides.createdAt ?? now,
        updatedAt: overrides.updatedAt ?? now,
        completedAt: overrides.completedAt,
    };
}

describe('fileTransfers', () => {
    it('resolves a task id from scalar or repeated navigation parameters', () => {
        const tasks = [
            task({ id: 'first' }),
            task({ id: 'second' }),
        ];

        expect(findTransferTaskById(tasks, 'second')?.id).toBe('second');
        expect(findTransferTaskById(tasks, ['missing', 'first'])?.id).toBe('first');
        expect(findTransferTaskById(tasks, 'missing')).toBeNull();
        expect(findTransferTaskById(tasks, undefined)).toBeNull();
    });

    it('summarizes transfer state per machine and globally', () => {
        const summary = buildTransferSummary([
            task({ id: 'a1', machineId: 'machine-a', status: 'downloading', downloadedBytes: 25, totalBytes: 100 }),
            task({ id: 'a2', machineId: 'machine-a', status: 'failed', error: 'network' }),
            task({ id: 'b1', machineId: 'machine-b', status: 'paused' }),
            task({ id: 'b2', machineId: 'machine-b', status: 'completed', completedAt: now - 5_000 }),
        ], now);

        expect(summary.global).toMatchObject({
            activeCount: 1,
            failedCount: 1,
            pausedCount: 1,
            completedRecentCount: 1,
            totalCount: 4,
        });
        expect(summary.byMachine['machine-a']).toMatchObject({
            machineId: 'machine-a',
            activeCount: 1,
            failedCount: 1,
            pausedCount: 0,
            totalCount: 2,
        });
        expect(summary.byMachine['machine-b']).toMatchObject({
            machineId: 'machine-b',
            activeCount: 0,
            failedCount: 0,
            pausedCount: 1,
            completedRecentCount: 1,
            totalCount: 2,
        });
    });

    it('uses failed badge before active badge for a machine', () => {
        const summary = buildTransferSummary([
            task({ id: 'a1', machineId: 'machine-a', status: 'downloading' }),
            task({ id: 'a2', machineId: 'machine-a', status: 'failed' }),
        ], now);

        expect(getMachineTransferBadge(summary.byMachine['machine-a'])).toEqual({
            tone: 'error',
            label: '! 1',
            accessibilityLabel: '1 failed transfer',
        });
    });

    it('builds an active download badge when there are no failures', () => {
        const summary = buildTransferSummary([
            task({ id: 'a1', machineId: 'machine-a', status: 'downloading' }),
            task({ id: 'a2', machineId: 'machine-a', status: 'queued' }),
        ], now);

        expect(getMachineTransferBadge(summary.byMachine['machine-a'])).toEqual({
            tone: 'active',
            label: '↓ 2',
            accessibilityLabel: '2 active transfers',
        });
    });

    it('filters transfer tasks by machine and status', () => {
        const tasks = [
            task({ id: 'a1', machineId: 'machine-a', status: 'downloading' }),
            task({ id: 'a2', machineId: 'machine-a', status: 'failed' }),
            task({ id: 'b1', machineId: 'machine-b', status: 'failed' }),
        ];

        expect(filterTransferTasks(tasks, { machineId: 'machine-a', status: 'failed' }).map(item => item.id)).toEqual(['a2']);
        expect(filterTransferTasks(tasks, { status: 'failed' }).map(item => item.id)).toEqual(['a2', 'b1']);
    });

    it('finds completed task ids inside the current list scope', () => {
        const tasks = [
            task({ id: 'a1', machineId: 'machine-a', status: 'completed' }),
            task({ id: 'a2', machineId: 'machine-a', status: 'failed' }),
            task({ id: 'b1', machineId: 'machine-b', status: 'completed' }),
        ];

        expect(getCompletedTransferTaskIds(tasks, { machineId: 'machine-a' })).toEqual(['a1']);
        expect(getCompletedTransferTaskIds(tasks, { status: 'failed' })).toEqual([]);
        expect(getCompletedTransferTaskIds(tasks, {})).toEqual(['a1', 'b1']);
    });

    it('formats the configured download directory label', () => {
        expect(getDownloadDirectoryLabel({ downloadDirectoryLabel: 'Download/AgentHub' }, 'Private')).toBe('Download/AgentHub');
        expect(getDownloadDirectoryLabel({}, 'Private')).toBe('Private');
    });

    it('detects common MIME types for Android file intents', () => {
        expect(getMimeTypeForFileName('photo.PNG')).toBe('image/png');
        expect(getMimeTypeForFileName('clip.mp4')).toBe('video/mp4');
        expect(getMimeTypeForFileName('notes.txt')).toBe('text/plain');
        expect(getMimeTypeForFileName('installer.APK')).toBe('application/vnd.android.package-archive');
        expect(getMimeTypeForFileName('archive.unknown')).toBe('application/octet-stream');
    });

    it('guards route status filters against unknown values', () => {
        expect(isFileTransferStatus('queued')).toBe(true);
        expect(isFileTransferStatus('cancelled')).toBe(true);
        expect(isFileTransferStatus('active')).toBe(false);
        expect(isFileTransferStatus('complete')).toBe(false);
    });
});
