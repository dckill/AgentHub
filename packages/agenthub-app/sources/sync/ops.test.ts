import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./apiSocket', () => ({
    getAgentHubClientId: () => 'web/test',
    apiSocket: {
        machineRPC: vi.fn(),
        sessionRPC: vi.fn(),
    },
}));
vi.mock('./serverConfig', () => ({ getServerUrl: () => 'https://server.test' }));

vi.mock('./authenticatedHttpClient', () => ({
    httpClient: { request: vi.fn() },
}));

vi.mock('./sync', () => ({
    sync: { getCredentials: vi.fn(() => null) },
}));

import { applyArchiveStopObservation, applyArchiveStopProjection, machineDeleteFile, machineListCodexModels, machineReadFile, machineSpawnNewSession, machineStopSession, requestSessionArchiveStop, sessionReadFile } from './ops';
import type { Session } from './storageTypes';
import { ignoreOfficialCodexThread, listIgnoredOfficialCodexThreads, listOfficialCodexThreadStates, listOfficialCodexThreads, unignoreOfficialCodexThread } from './officialThreads';
import { apiSocket } from './apiSocket';
import { httpClient } from './authenticatedHttpClient';
import { sync } from './sync';

describe('machineSpawnNewSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ type: 'success', sessionId: 's1' });
    });

    it('sends initial Codex permission mode and model to the daemon spawn RPC', async () => {
        await machineSpawnNewSession({
            machineId: 'm1',
            directory: '/repo',
            agent: 'codex',
            permissionMode: 'yolo',
            model: 'gpt-5.3-codex',
        });

        expect(apiSocket.machineRPC).toHaveBeenCalledWith(
            'm1',
            'spawn-agenthub-session',
            expect.objectContaining({
                type: 'spawn-in-directory',
                directory: '/repo',
                agent: 'codex',
                permissionMode: 'yolo',
                model: 'gpt-5.3-codex',
            }),
        );
    });
});

describe('machineReadFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({
            success: true,
            content: Buffer.from('chunk').toString('base64'),
            totalSize: 12,
            offset: 4,
            bytesRead: 5,
            truncated: true,
        });
    });

    it('sends offset and length to the machine readFile RPC', async () => {
        const result = await machineReadFile('m1', '/repo/file.bin', { offset: 4, length: 5 });

        expect(apiSocket.machineRPC).toHaveBeenCalledWith(
            'm1',
            'readFile',
            {
                path: '/repo/file.bin',
                offset: 4,
                length: 5,
            },
        );
        expect(result).toMatchObject({
            success: true,
            offset: 4,
            bytesRead: 5,
        });
    });
});

describe('machineListCodexModels', () => {
    it('requests the runtime catalog for the selected machine and directory', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({
            models: [],
            fetchedAt: 123,
            stale: false,
        });

        await machineListCodexModels('m1', '/repo');

        expect(apiSocket.machineRPC).toHaveBeenCalledWith(
            'm1',
            'codex-list-models',
            { directory: '/repo' },
            { timeoutMs: 20_000 },
        );
    });
});

describe('machineStopSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({
            message: 'Session stop requested',
            state: 'stopping',
        });
    });

    it('preserves the daemon structured stop state for App RPC consumers', async () => {
        await expect(machineStopSession('machine-1', 'session-1')).resolves.toEqual({
            message: 'Session stop requested',
            state: 'stopping',
        });
        expect(apiSocket.machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'stop-session',
            { sessionId: 'session-1' },
        );
    });
});

describe('requestSessionArchiveStop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns daemon stopping state without downgrading to killSession', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ message: 'stop requested', state: 'stopping' });
        vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });
        vi.mocked(sync.getCredentials).mockReturnValue({ token: 'test-token' } as any);

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).resolves.toEqual({
            state: 'stopping',
            source: 'daemon',
        });
        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
        expect(httpClient.request).toHaveBeenCalledWith(
            { token: 'test-token' },
            '/v1/sessions/session-1/archive',
            { method: 'POST' },
        );
    });

    it('archives after the daemon already reports an exited runner', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ message: 'runner exited', state: 'exited' });
        vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });
        vi.mocked(sync.getCredentials).mockReturnValue({ token: 'test-token' } as any);

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).resolves.toEqual({
            state: 'exited',
            source: 'daemon',
        });
        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
    });

    it('falls back to the legacy session RPC when the daemon is unavailable', async () => {
        vi.mocked(apiSocket.machineRPC).mockRejectedValue(new Error('offline'));
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({ success: true, message: 'Killing agenthub-cli process' });
        vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).resolves.toEqual({
            state: 'exited',
            source: 'session-rpc',
        });
        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'killSession', {});
        expect(httpClient.request).toHaveBeenCalledWith(
            { token: 'test-token' },
            '/v1/sessions/session-1/archive',
            { method: 'POST' },
        );
    });

    it('preserves daemon timeout state after server archive instead of downgrading to kill', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ message: 'stop timed out', state: 'timeout' });
        vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).resolves.toEqual({
            state: 'timeout',
            source: 'daemon',
        });
        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
        expect(httpClient.request).toHaveBeenCalled();
    });

    it('preserves daemon not-found state after server archive', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ message: 'runner not found', state: 'not-found' });
        vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).resolves.toEqual({
            state: 'not-found',
            source: 'daemon',
        });
        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
    });

    it('publishes the daemon lifecycle observation before the server archive settles', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ message: 'stop timed out', state: 'timeout' });
        vi.mocked(sync.getCredentials).mockReturnValue({ token: 'test-token' } as any);
        let resolveArchive!: (value: { status: number; data: { success: boolean } }) => void;
        vi.mocked(httpClient.request).mockImplementation(() => new Promise((resolve) => {
            resolveArchive = resolve;
        }));
        const onDaemonState = vi.fn();

        const archivePromise = requestSessionArchiveStop('session-1', 'machine-1', { onDaemonState });

        await vi.waitFor(() => {
            expect(onDaemonState).toHaveBeenCalledWith({ state: 'timeout', source: 'daemon' });
        });
        expect(httpClient.request).toHaveBeenCalled();

        resolveArchive({ status: 200, data: { success: true } });
        await expect(archivePromise).resolves.toEqual({ state: 'timeout', source: 'daemon' });
    });

    it('polls a stopping daemon until timeout before committing the server archive', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(apiSocket.machineRPC)
                .mockResolvedValueOnce({ message: 'stop requested', state: 'stopping' })
                .mockResolvedValueOnce({ message: 'still stopping', state: 'stopping' })
                .mockResolvedValueOnce({ message: 'stop timed out', state: 'timeout' });
            vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });
            vi.mocked(sync.getCredentials).mockReturnValue({ token: 'test-token' } as any);
            const onDaemonState = vi.fn();

            const archivePromise = requestSessionArchiveStop('session-1', 'machine-1', { onDaemonState });
            await vi.waitFor(() => expect(onDaemonState).toHaveBeenCalledTimes(1));
            expect(onDaemonState).toHaveBeenLastCalledWith({ state: 'stopping', source: 'daemon' });
            expect(httpClient.request).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(500);

            await expect(archivePromise).resolves.toEqual({ state: 'timeout', source: 'daemon' });
            expect(onDaemonState.mock.calls).toEqual([
                [{ state: 'stopping', source: 'daemon' }],
                [{ state: 'timeout', source: 'daemon' }],
            ]);
            expect(apiSocket.machineRPC).toHaveBeenCalledTimes(3);
            expect(httpClient.request).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('retries a transient polling failure and still publishes the daemon terminal state', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(apiSocket.machineRPC)
                .mockResolvedValueOnce({ message: 'stop requested', state: 'stopping' })
                .mockRejectedValueOnce(new Error('temporary transport timeout'))
                .mockResolvedValueOnce({ message: 'stop timed out', state: 'timeout' });
            vi.mocked(httpClient.request).mockResolvedValue({ status: 200, data: { success: true } });
            vi.mocked(sync.getCredentials).mockReturnValue({ token: 'test-token' } as any);
            const onDaemonState = vi.fn();

            const archivePromise = requestSessionArchiveStop('session-1', 'machine-1', { onDaemonState });
            await vi.waitFor(() => expect(onDaemonState).toHaveBeenCalledTimes(1));

            await vi.advanceTimersByTimeAsync(500);

            await expect(archivePromise).resolves.toEqual({ state: 'timeout', source: 'daemon' });
            expect(onDaemonState.mock.calls).toEqual([
                [{ state: 'stopping', source: 'daemon' }],
                [{ state: 'timeout', source: 'daemon' }],
            ]);
            expect(apiSocket.machineRPC).toHaveBeenCalledTimes(3);
            expect(httpClient.request).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not downgrade a successful daemon stop when server archive fails', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ message: 'runner exited', state: 'exited' });
        vi.mocked(httpClient.request).mockRejectedValue(new Error('archive endpoint unavailable'));
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({ success: true, message: 'Killing agenthub-cli process' });

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).rejects.toThrow('archive endpoint unavailable');
        expect(apiSocket.sessionRPC).not.toHaveBeenCalled();
    });

    it('archives after a legacy kill succeeds so Server cannot retain an active session', async () => {
        vi.mocked(apiSocket.machineRPC).mockRejectedValue(new Error('offline'));
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({ success: true, message: 'Killing agenthub-cli process' });
        vi.mocked(httpClient.request).mockRejectedValue(new Error('archive endpoint unavailable'));
        vi.mocked(sync.getCredentials).mockReturnValue({ token: 'test-token' } as any);

        await expect(requestSessionArchiveStop('session-1', 'machine-1')).rejects.toThrow('archive endpoint unavailable');
        expect(apiSocket.sessionRPC).toHaveBeenCalledWith('session-1', 'killSession', {});
        expect(httpClient.request).toHaveBeenCalled();
    });
});

describe('applyArchiveStopObservation', () => {
    const session = {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 2,
        active: true,
        activeAt: 2,
        metadata: {
            path: '/repo',
            host: 'host',
            lifecycleState: 'running',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: true,
        thinkingAt: 2,
        presence: 'online',
    } as Session;

    it.each([
        ['stopping', 'archiveRequested'],
        ['exited', 'exited'],
        ['timeout', 'timeout'],
        ['not-found', 'not-found'],
    ] as const)('projects daemon %s as transient lifecycle %s without claiming process termination', (state, lifecycleState) => {
        const projected = applyArchiveStopObservation(session, { state, source: 'daemon' }, 99);

        expect(projected).toMatchObject({
            active: true,
            thinking: true,
            metadata: { lifecycleState, lifecycleStateSince: 99 },
        });
        expect(session.metadata?.lifecycleState).toBe('running');
    });
});

describe('applyArchiveStopProjection', () => {
    const session = {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 2,
        active: true,
        activeAt: 2,
        metadata: {
            path: '/repo',
            host: 'host',
            lifecycleState: 'running',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: true,
        thinkingAt: 2,
        presence: 'online',
    } as Session;

    it('projects the completed archive as archived while retaining the observed daemon stop result', () => {
        const stopResult = { state: 'stopping', source: 'daemon' } as const;
        const projected = applyArchiveStopProjection(session, stopResult, 99);

        expect(projected).toMatchObject({
            active: false,
            activeAt: 99,
            thinking: false,
            thinkingAt: 99,
            metadata: { lifecycleState: 'archived' },
        });
        expect(stopResult.state).toBe('stopping');
        expect(session.active).toBe(true);
        expect(session.metadata?.lifecycleState).toBe('running');
    });

    it('projects every successful archive path as terminal archived', () => {
        expect(applyArchiveStopProjection(session, { state: 'archived', source: 'server' }, 100).metadata?.lifecycleState).toBe('archived');
        expect(applyArchiveStopProjection(session, { state: 'exited', source: 'session-rpc' }, 101).metadata?.lifecycleState).toBe('archived');
        expect(applyArchiveStopProjection(session, { state: 'timeout', source: 'daemon' }, 102).metadata?.lifecycleState).toBe('archived');
        expect(applyArchiveStopProjection(session, { state: 'not-found', source: 'daemon' }, 103).metadata?.lifecycleState).toBe('archived');
    });
});

describe('sessionReadFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(apiSocket.sessionRPC).mockResolvedValue({
            success: true,
            content: Buffer.from('chunk').toString('base64'),
            totalSize: 12,
            offset: 4,
            bytesRead: 5,
            truncated: true,
        });
    });

    it('sends offset and length to the session readFile RPC', async () => {
        const result = await sessionReadFile('s1', '/repo/file.bin', { offset: 4, length: 5 });

        expect(apiSocket.sessionRPC).toHaveBeenCalledWith(
            's1',
            'readFile',
            {
                path: '/repo/file.bin',
                offset: 4,
                length: 5,
            },
        );
        expect(result).toMatchObject({
            success: true,
            offset: 4,
            bytesRead: 5,
        });
    });

    it('forwards caller cancellation without serializing the signal into RPC params', async () => {
        const controller = new AbortController();

        await sessionReadFile('s1', '/repo/file.bin', {
            offset: 4,
            length: 5,
            signal: controller.signal,
        });

        expect(apiSocket.sessionRPC).toHaveBeenCalledWith(
            's1',
            'readFile',
            { path: '/repo/file.bin', offset: 4, length: 5 },
            { signal: controller.signal },
        );
    });
});

describe('machineDeleteFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({ success: true });
    });

    it('sends the remote path to the machine deleteFile RPC', async () => {
        const result = await machineDeleteFile('m1', '/repo/file.bin');

        expect(apiSocket.machineRPC).toHaveBeenCalledWith(
            'm1',
            'deleteFile',
            { path: '/repo/file.bin' },
        );
        expect(result).toEqual({ success: true });
    });
});

describe('listOfficialCodexThreads', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(apiSocket.machineRPC).mockResolvedValue({
            type: 'success',
            threads: [{ id: 'thread-1', machineId: 'm1', cwd: '/repo', title: 'T1', updatedAt: 1, archived: false }],
        });
    });

    it('calls the official codex threads RPC', async () => {
        const threads = await listOfficialCodexThreads('m1');

        expect(apiSocket.machineRPC).toHaveBeenCalledWith('m1', 'codex-list-official-threads', {});
        expect(threads).toEqual([expect.objectContaining({ id: 'thread-1', cwd: '/repo' })]);
    });

    it('calls the official codex thread states RPC', async () => {
        vi.mocked(apiSocket.machineRPC).mockResolvedValueOnce({
            type: 'success',
            threadStates: [{ id: 'thread-1', archived: true }],
        });

        const threadStates = await listOfficialCodexThreadStates('m1', ['thread-1']);

        expect(apiSocket.machineRPC).toHaveBeenCalledWith('m1', 'codex-list-official-thread-states', { threadIds: ['thread-1'] });
        expect(threadStates).toEqual([{ id: 'thread-1', archived: true }]);
    });

    it('calls ignore-related official codex thread RPCs', async () => {
        vi.mocked(apiSocket.machineRPC)
            .mockResolvedValueOnce({ type: 'success', threadIds: ['thread-1'] })
            .mockResolvedValueOnce({ type: 'success' })
            .mockResolvedValueOnce({ type: 'success' });

        const ignored = await listIgnoredOfficialCodexThreads('m1');
        await ignoreOfficialCodexThread('m1', 'thread-1');
        await unignoreOfficialCodexThread('m1', 'thread-1');

        expect(ignored).toEqual(['thread-1']);
        expect(apiSocket.machineRPC).toHaveBeenNthCalledWith(1, 'm1', 'codex-list-ignored-official-threads', {});
        expect(apiSocket.machineRPC).toHaveBeenNthCalledWith(2, 'm1', 'codex-ignore-official-thread', { threadId: 'thread-1' });
        expect(apiSocket.machineRPC).toHaveBeenNthCalledWith(3, 'm1', 'codex-unignore-official-thread', { threadId: 'thread-1' });
    });
});
