import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiMachineClient } from './apiMachine';
import { decodeBase64, decrypt, encodeBase64, encrypt } from './encryption';

const mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    forkThread: vi.fn(),
    readThread: vi.fn(),
    rollbackThread: vi.fn(),
    injectItems: vi.fn(),
    listModels: vi.fn(),
}));

vi.mock('@/codex/codexAppServerClient', () => ({
    CodexAppServerClient: vi.fn().mockImplementation(() => ({
        connect: mocks.connect,
        disconnect: mocks.disconnect,
        forkThread: mocks.forkThread,
        readThread: mocks.readThread,
        rollbackThread: mocks.rollbackThread,
        injectItems: mocks.injectItems,
        listModels: mocks.listModels,
    })),
}));

const machine = {
    id: 'machine-1',
    encryptionKey: new Uint8Array(32),
    encryptionVariant: 'legacy' as const,
};

function rpcClient(stopSession: ReturnType<typeof vi.fn> = vi.fn()) {
    const client = new ApiMachineClient('token', machine as any);
    client.setRPCHandlers({
        spawnSession: vi.fn(),
        stopSession,
        requestShutdown: vi.fn(),
        checkCliUpdate: vi.fn(async () => ({
            phase: 'available' as const, currentVersion: '1.1.4', latestVersion: '1.2.0', updateAvailable: true, canUpdate: true,
        })),
        updateCli: vi.fn(async () => ({
            accepted: true,
            status: { phase: 'updating' as const, currentVersion: '1.1.4', targetVersion: '1.2.0', updateAvailable: true, canUpdate: true },
        })),
        rollbackCli: vi.fn(async () => ({
            accepted: true,
            status: { phase: 'updating' as const, currentVersion: '1.2.0', targetVersion: '1.1.4', updateAvailable: false, canUpdate: true },
        })),
    });
    return client;
}

async function callRpc(client: ApiMachineClient, method: string, params: unknown) {
    const encoded = encodeBase64(encrypt(machine.encryptionKey, machine.encryptionVariant, params));
    const response = await (client as any).rpcHandlerManager.handleRequest({
        method: `${machine.id}:${method}`,
        params: encoded,
    });
    return decrypt(machine.encryptionKey, machine.encryptionVariant, decodeBase64(response));
}

describe('ApiMachineClient Codex fork RPC handlers', () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => mock.mockReset());
    });

    it('delivers the structured stop-session state through encrypted RPC', async () => {
        const stopSession = vi.fn(() => ({ success: true as const, state: 'timeout' as const }));

        const result = await callRpc(rpcClient(stopSession), 'stop-session', {
            sessionId: 'session-to-stop',
        });

        expect(result).toEqual({ message: 'Session stop requested', state: 'timeout' });
        expect(stopSession).toHaveBeenCalledWith('session-to-stop');
    });

    it('preserves a daemon not-found stop state through encrypted RPC', async () => {
        const stopSession = vi.fn(() => ({ success: false as const, state: 'not-found' as const }));

        const result = await callRpc(rpcClient(stopSession), 'stop-session', {
            sessionId: 'already-exited',
        });

        expect(result).toEqual({ message: 'Session stop requested', state: 'not-found' });
    });

    it('exposes encrypted CLI update lifecycle RPCs', async () => {
        const client = rpcClient();
        await expect(callRpc(client, 'check-cli-update', {})).resolves.toMatchObject({ phase: 'available', latestVersion: '1.2.0' });
        await expect(callRpc(client, 'update-cli', { version: '1.2.0' })).resolves.toMatchObject({ accepted: true });
        await expect(callRpc(client, 'rollback-cli', {})).resolves.toMatchObject({ accepted: true });
    });

    it('forks a Codex thread through the app-server client', async () => {
        mocks.connect.mockResolvedValueOnce(undefined);
        mocks.disconnect.mockResolvedValueOnce(undefined);
        mocks.forkThread.mockResolvedValueOnce({
            threadId: 'thread-forked',
            thread: { id: 'thread-forked', turns: [] },
        });

        const result = await callRpc(rpcClient(), 'codex-fork-thread', {
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
        });

        expect(result).toEqual({ type: 'success', newCodexThreadId: 'thread-forked' });
        expect(mocks.connect).toHaveBeenCalledTimes(1);
        expect(mocks.forkThread).toHaveBeenCalledWith({
            threadId: 'thread-source',
            cwd: '/tmp/project',
        });
        expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    });

    it('lists Codex rewind points from a persisted thread', async () => {
        mocks.connect.mockResolvedValueOnce(undefined);
        mocks.disconnect.mockResolvedValueOnce(undefined);
        mocks.readThread.mockResolvedValueOnce({
            thread: {
                id: 'thread-source',
                turns: [{
                    id: 'turn-1',
                    startedAt: 12,
                    items: [
                        { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'first prompt' }] },
                        { type: 'agentMessage', id: 'agent-1', text: 'answer' },
                    ],
                }],
            },
        });

        const result = await callRpc(rpcClient(), 'codex-list-rewind-points', {
            codexThreadId: 'thread-source',
        });

        expect(result).toEqual({
            type: 'success',
            points: [{ itemId: 'user-1', text: 'first prompt', timestamp: 12_000 }],
        });
        expect(mocks.readThread).toHaveBeenCalledWith({ threadId: 'thread-source' });
        expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    });

    it('lists models through the machine-scoped Codex runtime RPC', async () => {
        mocks.connect.mockResolvedValueOnce(undefined);
        mocks.disconnect.mockResolvedValueOnce(undefined);
        mocks.listModels.mockResolvedValueOnce([{
            id: 'gpt-latest',
            model: 'gpt-latest',
            displayName: 'GPT Latest',
            description: 'Current runtime default',
            hidden: false,
            isDefault: true,
            supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }],
            defaultReasoningEffort: 'medium',
            serviceTiers: [],
        }]);

        const result = await callRpc(rpcClient(), 'codex-list-models', { directory: '/tmp/project' });

        expect(result).toMatchObject({
            models: [expect.objectContaining({ model: 'gpt-latest', isDefault: true })],
            stale: false,
        });
        expect(mocks.listModels).toHaveBeenCalledWith({ includeHidden: false });
        expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    });

    it('returns a stale model catalog immediately while refreshing it in the background', async () => {
        const client = rpcClient();
        const catalog = [{
            id: 'gpt-latest', model: 'gpt-latest', displayName: 'GPT Latest', description: '',
            hidden: false, isDefault: true, supportedReasoningEfforts: [],
            defaultReasoningEffort: 'medium', serviceTiers: [],
        }];
        mocks.connect.mockResolvedValue(undefined);
        mocks.disconnect.mockResolvedValue(undefined);
        mocks.listModels.mockResolvedValue(catalog);

        const first = await callRpc(client, 'codex-list-models', { directory: '/tmp/project' }) as any;
        const now = vi.spyOn(Date, 'now').mockReturnValue(first.fetchedAt + (5 * 60 * 1000) + 1);
        const stale = await callRpc(client, 'codex-list-models', { directory: '/tmp/project' }) as any;

        expect(stale).toMatchObject({ models: catalog, fetchedAt: first.fetchedAt, stale: true });
        await vi.waitFor(() => expect(mocks.listModels).toHaveBeenCalledTimes(2));
        now.mockRestore();
    });

    it('duplicates a Codex thread from a selected rewind point', async () => {
        const thread = {
            id: 'thread-forked',
            turns: [
                {
                    id: 'turn-1',
                    items: [{ type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'first' }] }],
                },
                {
                    id: 'turn-2',
                    items: [{ type: 'userMessage', id: 'user-2', content: [{ type: 'text', text: 'second' }] }],
                },
            ],
        };
        mocks.connect.mockResolvedValueOnce(undefined);
        mocks.disconnect.mockResolvedValueOnce(undefined);
        mocks.forkThread.mockResolvedValueOnce({ threadId: 'thread-forked', thread });
        mocks.rollbackThread.mockResolvedValueOnce({ thread: { id: 'thread-forked', turns: [thread.turns[0]] } });
        mocks.injectItems.mockResolvedValueOnce({});

        const result = await callRpc(rpcClient(), 'codex-duplicate-thread', {
            directory: '/tmp/project',
            codexThreadId: 'thread-source',
            cutAfterItemId: 'user-2',
        });

        expect(result).toEqual({ type: 'success', newCodexThreadId: 'thread-forked' });
        expect(mocks.rollbackThread).toHaveBeenCalledWith({ threadId: 'thread-forked', numTurns: 1 });
        expect(mocks.injectItems).toHaveBeenCalledWith({
            threadId: 'thread-forked',
            items: [{
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'second' }],
            }],
        });
        expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    });
});
