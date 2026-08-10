import { describe, expect, it, vi } from 'vitest';
import { runSyncInitializationApplication } from './syncInitializationApplication';

describe('sync initialization application', () => {
    it('initializes encryption, tracking, socket status and the selected account mode in order', async () => {
        const events: string[] = [];
        const encryption = { anonID: 'anon-1' };
        const statusListener = vi.fn();

        await runSyncInitializationApplication({
            credentials: { secret: 'encoded-secret', token: 'token-1' },
            restore: false,
            endpoint: 'https://example.test',
            deviceId: 'device-1',
            decodeSecret: () => new Uint8Array(32),
            createEncryption: async () => {
                events.push('encryption');
                return encryption;
            },
            assertCurrent: () => events.push('assert'),
            initializeTracking: (anonID) => events.push(`tracking:${anonID}`),
            initializeSocket: (options) => events.push(`socket:${options.token}`),
            onSocketStatusChange: (listener) => {
                statusListener.mockImplementation(listener);
                events.push('status-listener');
            },
            setSocketStatus: () => undefined,
            createAccount: async () => { events.push('create'); },
            restoreAccount: async () => { events.push('restore'); },
        });

        expect(events).toEqual([
            'encryption', 'assert', 'tracking:anon-1', 'assert',
            'socket:token-1', 'assert', 'status-listener', 'create',
        ]);
        expect(statusListener).toHaveBeenCalledTimes(0);
    });

    it('passes the initial app state through the socket initialization contract', async () => {
        const initializeSocket = vi.fn();

        await runSyncInitializationApplication({
            credentials: { secret: 'encoded-secret', token: 'token-1' },
            restore: true,
            endpoint: 'https://example.test',
            deviceId: 'device-1',
            appState: 'background',
            decodeSecret: () => new Uint8Array(32),
            createEncryption: async () => ({ anonID: 'anon-1' }),
            assertCurrent: vi.fn(),
            initializeTracking: vi.fn(),
            initializeSocket,
            onSocketStatusChange: vi.fn(),
            setSocketStatus: vi.fn(),
            createAccount: vi.fn(),
            restoreAccount: vi.fn(),
        });

        expect(initializeSocket).toHaveBeenCalledWith(expect.objectContaining({ appState: 'background' }), expect.anything());
    });

    it('rejects secrets that do not decode to exactly 32 bytes before side effects', async () => {
        const createEncryption = vi.fn();
        await expect(runSyncInitializationApplication({
            credentials: { secret: 'bad', token: 'token-1' },
            restore: true,
            endpoint: 'https://example.test',
            deviceId: 'device-1',
            decodeSecret: () => new Uint8Array(31),
            createEncryption,
            assertCurrent: vi.fn(),
            initializeTracking: vi.fn(),
            initializeSocket: vi.fn(),
            onSocketStatusChange: vi.fn(),
            setSocketStatus: vi.fn(),
            createAccount: vi.fn(),
            restoreAccount: vi.fn(),
        })).rejects.toThrow('Invalid secret key length: 31, expected 32');
        expect(createEncryption).not.toHaveBeenCalled();
    });
});
