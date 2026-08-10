import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';

vi.hoisted(() => {
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
});

vi.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.0.0' } },
}));

vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {
        getCredentials: vi.fn(),
    },
}));

vi.mock('./storage', () => ({
    storage: {
        getState: vi.fn(() => ({ localSettings: { verboseLogging: false } })),
    },
}));

vi.mock('./deviceIdentity', () => ({ getOrCreateDeviceId: () => 'device-test' }));

vi.mock('socket.io-client', () => ({
    io: vi.fn(),
}));

import { apiSocket, RpcError } from './apiSocket';

describe('apiSocket session RPC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (apiSocket as any).socket = null;
        (apiSocket as any).config = null;
        (apiSocket as any).encryption = null;
    });

    it('preserves server errors for session RPC failures', async () => {
        const encryptRaw = vi.fn(async (params: unknown) => `encrypted:${JSON.stringify(params)}`);
        const decryptRaw = vi.fn(async () => ({ success: true }));

        const emitWithAck = vi.fn(async () => ({
                ok: false,
                error: 'RPC method not available',
            }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getSessionEncryption: vi.fn(() => ({
                encryptRaw,
                decryptRaw,
            })),
        };

        await expect(apiSocket.sessionRPC('session-1', 'getDirectoryTree', { path: '/repo', maxDepth: 3 }))
            .rejects.toMatchObject({
                name: 'RpcError',
                code: 'REMOTE_ERROR',
                message: 'RPC method not available',
            });
        expect(timeout).toHaveBeenCalledWith(15_000);
    });

    it('does not emit an RPC call when the caller signal is already aborted', async () => {
        const emitWithAck = vi.fn();
        const timeout = vi.fn(() => ({ emitWithAck }));
        const controller = new AbortController();
        controller.abort();
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getSessionEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => ({})),
            })),
        };

        await expect(apiSocket.sessionRPC('session-1', 'readFile', { path: '/repo/a' }, {
            signal: controller.signal,
        })).rejects.toEqual(expect.objectContaining({ code: 'ABORTED' }));
        expect(emitWithAck).not.toHaveBeenCalled();
    });

    it('rejects an in-flight RPC call when the caller aborts', async () => {
        const emitWithAck = vi.fn(() => new Promise(() => {}));
        const timeout = vi.fn(() => ({ emitWithAck }));
        const controller = new AbortController();
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getMachineEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => ({})),
            })),
        };

        const pending = apiSocket.machineRPC('machine-1', 'readFile', { path: '/repo/a' }, {
            signal: controller.signal,
        });
        controller.abort();

        await expect(pending).rejects.toEqual(expect.objectContaining({ code: 'ABORTED' }));
    });

    it('does not emit when cancellation happens while encrypting parameters', async () => {
        let finishEncryption!: (value: string) => void;
        const encryptRaw = vi.fn(() => new Promise<string>((resolve) => {
            finishEncryption = resolve;
        }));
        const emitWithAck = vi.fn(async () => ({ ok: true, result: 'encrypted-result' }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        const controller = new AbortController();
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getMachineEncryption: vi.fn(() => ({
                encryptRaw,
                decryptRaw: vi.fn(async () => ({ success: true })),
            })),
        };

        const pending = apiSocket.machineRPC('machine-1', 'readFile', { path: '/repo/a' }, {
            signal: controller.signal,
        });
        controller.abort();
        finishEncryption('encrypted-params');

        await expect(pending).rejects.toEqual(expect.objectContaining({ code: 'ABORTED' }));
        expect(emitWithAck).not.toHaveBeenCalled();
    });

    it('rejects malformed responses for registered RPC methods', async () => {
        const emitWithAck = vi.fn(async () => ({ ok: true, result: 'encrypted-result' }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getMachineEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => ({ success: 'yes' })),
            })),
        };

        await expect(apiSocket.machineRPC('machine-1', 'readFile', { path: '/repo/a' }))
            .rejects.toEqual(expect.objectContaining({ code: 'INVALID_RESPONSE' } satisfies Partial<RpcError>));
    });

    it('preserves encrypted remote protocol error codes', async () => {
        const emitWithAck = vi.fn(async () => ({ ok: true, result: 'encrypted-result' }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getMachineEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => ({
                    __rpcError: { code: 'INVALID_REQUEST', message: 'Invalid RPC request: readFile' },
                })),
            })),
        };

        await expect(apiSocket.machineRPC('machine-1', 'readFile', { path: '/repo/a' }))
            .rejects.toEqual(expect.objectContaining({
                code: 'REMOTE_ERROR',
                remoteCode: 'INVALID_REQUEST',
                message: 'Invalid RPC request: readFile',
            }));
    });

    it('rejects a non-null response for a registered void control RPC', async () => {
        const emitWithAck = vi.fn(async () => ({ ok: true, result: 'encrypted-result' }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getSessionEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => ({ ok: true })),
            })),
        };

        await expect(apiSocket.sessionRPC('session-1', 'abort', { reason: 'cancel' }))
            .rejects.toEqual(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    });

    it('applies the RPC timeout to machine and generic acknowledgements', async () => {
        const emitWithAck = vi.fn(async () => ({ ok: true, result: 'encrypted-result' }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getMachineEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => 'decrypted-result'),
            })),
        };

        await expect(apiSocket.machineRPC('machine-1', 'extension-method', {})).resolves.toBe('decrypted-result');
        await expect(apiSocket.emitWithAck('event', {})).resolves.toEqual({ ok: true, result: 'encrypted-result' });
        expect(timeout).toHaveBeenNthCalledWith(1, 15_000);
        expect(timeout).toHaveBeenNthCalledWith(2, 15_000);
    });

    it('allows a caller to shorten the machine RPC acknowledgement timeout', async () => {
        const emitWithAck = vi.fn(async () => ({ ok: true, result: 'encrypted-result' }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };
        (apiSocket as any).encryption = {
            getMachineEncryption: vi.fn(() => ({
                encryptRaw: vi.fn(async () => 'encrypted-params'),
                decryptRaw: vi.fn(async () => 'decrypted-result'),
            })),
        };

        await expect(apiSocket.machineRPC('machine-1', 'extension-method', {}, { timeoutMs: 1_500 }))
            .resolves.toBe('decrypted-result');
        expect(timeout).toHaveBeenCalledWith(1_500);
    });


    it('checks session RPC presence without invoking the RPC method', async () => {
        const emitWithAck = vi.fn(async () => ({ ok: true, available: false }));
        const timeout = vi.fn(() => ({ emitWithAck }));
        (apiSocket as any).socket = { timeout };

        await expect(apiSocket.sessionRPCAvailable('session-1', 'getDirectoryTree')).resolves.toBe(false);

        expect(timeout).toHaveBeenCalledWith(2500);
        expect(emitWithAck).toHaveBeenCalledWith('rpc-presence', {
            method: 'session-1:getDirectoryTree',
        });
    });

    it('resets all account-scoped socket state and is idempotent', () => {
        const disconnect = vi.fn();
        const messageHandler = vi.fn();
        const chunkHandler = vi.fn();
        const reconnectedListener = vi.fn();
        const statusListener = vi.fn();

        (apiSocket as any).socket = { disconnect };
        (apiSocket as any).config = { endpoint: 'https://account-a.example', token: 'token-a' };
        (apiSocket as any).encryption = { account: 'a' };
        (apiSocket as any).messageHandlers.set('update', messageHandler);
        (apiSocket as any).fileTransferChunkHandlers.set('transfer:attempt', chunkHandler);
        (apiSocket as any).reconnectedListeners.add(reconnectedListener);
        (apiSocket as any).statusListeners.add(statusListener);
        (apiSocket as any).currentStatus = 'connected';

        apiSocket.reset();
        apiSocket.reset();

        expect(disconnect).toHaveBeenCalledTimes(1);
        expect((apiSocket as any).socket).toBeNull();
        expect((apiSocket as any).config).toBeNull();
        expect((apiSocket as any).encryption).toBeNull();
        expect((apiSocket as any).messageHandlers.size).toBe(0);
        expect((apiSocket as any).fileTransferChunkHandlers.size).toBe(0);
        expect((apiSocket as any).reconnectedListeners.size).toBe(0);
        expect((apiSocket as any).statusListeners.size).toBe(0);
        expect((apiSocket as any).currentStatus).toBe('disconnected');
    });

    it('publishes the current AppState to the connected user-scoped socket', () => {
        const emit = vi.fn();
        (apiSocket as any).socket = { emit, connected: true };

        apiSocket.setAppState('background');

        expect(emit).toHaveBeenCalledWith('app-state', { state: 'background' });
    });

    it('reasserts the current AppState after an automatic socket reconnect', () => {
        const emit = vi.fn();
        const handlers = new Map<string, (...args: any[]) => void>();
        const socket = {
            on: vi.fn((event: string, handler: (...args: any[]) => void) => {
                handlers.set(event, handler);
            }),
            onAny: vi.fn(),
            emit,
        };
        vi.mocked(io).mockReturnValue(socket as any);
        (apiSocket as any).config = {
            endpoint: 'https://server.example',
            token: 'token-a',
            appState: 'background',
        };
        (apiSocket as any).appState = 'background';

        (apiSocket as any).connect();
        handlers.get('connect')?.();

        expect(emit).toHaveBeenCalledWith('app-state', { state: 'background' });
    });

    it('rebuilds Socket.IO auth from the latest AppState on every reconnect', () => {
        const socket = {
            on: vi.fn(),
            onAny: vi.fn(),
            emit: vi.fn(),
        };
        vi.mocked(io).mockReturnValue(socket as any);
        (apiSocket as any).config = {
            endpoint: 'https://server.example',
            token: 'token-a',
            appState: 'active',
        };
        (apiSocket as any).appState = 'active';

        (apiSocket as any).connect();

        const options = vi.mocked(io).mock.calls[0]?.[1] as { auth?: (callback: (payload: any) => void) => void };
        expect(typeof options.auth).toBe('function');

        let firstPayload: any;
        options.auth?.((payload) => {
            firstPayload = payload;
        });
        expect(firstPayload).toMatchObject({
            token: 'token-a',
            clientType: 'user-scoped',
            appState: 'active',
        });

        (apiSocket as any).appState = 'background';
        let reconnectPayload: any;
        options.auth?.((payload) => {
            reconnectPayload = payload;
        });
        expect(reconnectPayload).toMatchObject({
            token: 'token-a',
            clientType: 'user-scoped',
            appState: 'background',
        });
    });
});
