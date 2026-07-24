import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiMachineClient } from './apiMachine';

const {
    mockIo,
    mockBackoff,
} = vi.hoisted(() => ({
    mockIo: vi.fn(),
    mockBackoff: vi.fn(async <T>(callback: () => Promise<T>) => callback()),
}));

vi.mock('socket.io-client', () => ({
    io: mockIo,
}));

vi.mock('@/configuration', () => ({
    configuration: {
        serverUrl: 'https://server.test',
        currentCliVersion: '1.0.3',
    },
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

vi.mock('@/utils/time', () => ({
    backoff: mockBackoff,
}));

vi.mock('@/modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn(),
}));

vi.mock('@/utils/detectCLI', () => ({
    detectCLIAvailability: vi.fn(async () => ({
        claude: false,
        codex: false,
        detectedAt: 0,
    })),
}));

vi.mock('@/resume/localAgentHubAgentAuth', () => ({
    detectResumeSupport: vi.fn(async () => ({
        rpcAvailable: false,
        requiresSameMachine: true,
        requiresAgentHubAgentAuth: true,
        agenthubAgentAuthenticated: false,
        detectedAt: 0,
    })),
}));

vi.mock('@/claude/officialSessions', () => ({
    listOfficialClaudeSessionsForMachine: vi.fn(async () => []),
}));

vi.mock('@/codex/officialSessions', () => ({
    listOfficialCodexThreadsForMachine: vi.fn(async () => []),
    listOfficialCodexThreadStatesForMachine: vi.fn(async () => []),
}));

type SocketHandler = (...args: any[]) => void;
type SocketHandlers = Record<string, SocketHandler[]>;

function makeMachine() {
    return {
        id: 'machine-1',
        encryptionKey: new Uint8Array(32),
        encryptionVariant: 'legacy' as const,
        metadata: {
            host: 'localhost',
            platform: 'linux',
            agentHubCliVersion: '1.0.3',
            homeDir: '/home/user',
            agentHubHomeDir: '/home/user/.agenthub',
            agentHubLibDir: '/home/user/.agenthub/lib',
        },
        metadataVersion: 0,
        daemonState: {
            status: 'running',
            pid: 123,
            httpPort: 456,
            startedAt: 1,
        },
        daemonStateVersion: 0,
    };
}

describe('ApiMachineClient reconnect handling', () => {
    let socketHandlers: SocketHandlers;
    let mockSocket: any;

    const emitSocketEvent = (event: string, ...args: any[]) => {
        const handlers = socketHandlers[event] || [];
        handlers.forEach((handler) => handler(...args));
    };

    beforeEach(() => {
        vi.clearAllMocks();
        socketHandlers = {};
        mockSocket = {
            connected: false,
            connect: vi.fn(),
            on: vi.fn((event: string, handler: SocketHandler) => {
                if (!socketHandlers[event]) {
                    socketHandlers[event] = [];
                }
                socketHandlers[event].push(handler);
            }),
            emit: vi.fn(),
            emitWithAck: vi.fn(async () => ({ result: 'success', daemonState: '', version: 0 })),
            timeout: vi.fn(() => ({
                emitWithAck: vi.fn(async () => ({ ok: true })),
            })),
            close: vi.fn(),
            io: {
                on: vi.fn(),
            },
        };
        mockIo.mockReturnValue(mockSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts smart reconnect after initial socket connection errors', async () => {
        vi.useFakeTimers();
        const client = new ApiMachineClient('token', makeMachine());
        client.connect();

        emitSocketEvent('connect_error', new Error('timeout'));
        await vi.advanceTimersByTimeAsync(1_000);

        expect(mockSocket.connect).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(3_000);
        expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    });

    it('does not reconnect after shutdown disconnects the socket', async () => {
        vi.useFakeTimers();
        const client = new ApiMachineClient('token', makeMachine());
        client.connect();

        client.shutdown();
        emitSocketEvent('disconnect', 'io client disconnect');
        await vi.advanceTimersByTimeAsync(4_000);

        expect(mockSocket.connect).not.toHaveBeenCalled();
    });
});
