import { describe, expect, it, vi } from 'vitest';
import { runMachineSnapshotSync } from './machineSnapshotSyncLifecycle';

function createMachineRecord(id: string, dataEncryptionKey: string | null = null) {
    return {
        id,
        metadata: `metadata-${id}`,
        metadataVersion: 1,
        daemonState: `daemon-${id}`,
        daemonStateVersion: 1,
        dataEncryptionKey,
        seq: 1,
        active: true,
        activeAt: 2,
        createdAt: 1,
        updatedAt: 2,
    };
}

describe('machine snapshot sync lifecycle', () => {
    it('fetches, decrypts, registers keys, and applies the machine snapshot', async () => {
        const setDataKey = vi.fn();
        const applyMachines = vi.fn();

        await runMachineSnapshotSync({
            generation: 4,
            assertCurrent: vi.fn(),
            existingMachines: {},
            existingMachineIdsAtStart: [],
            runRequest: async (_generation, operation) => operation({
                signal: new AbortController().signal,
                assertCurrent: vi.fn(),
            }),
            fetchMachines: async () => [createMachineRecord('m1', 'wrapped-key')],
            encryption: {
                decryptEncryptionKey: vi.fn(async () => Uint8Array.from([1, 2, 3])),
                initializeMachines: vi.fn(async () => undefined),
                getMachineEncryption: vi.fn(() => ({
                    decryptMetadata: vi.fn(async () => ({ path: '/tmp' })),
                    decryptDaemonState: vi.fn(async () => ({ status: 'running' })),
                } as never)),
            },
            setDataKey,
            applyMachines,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot: vi.fn(),
            log: vi.fn(),
        });

        expect(setDataKey).toHaveBeenCalledWith('m1', Uint8Array.from([1, 2, 3]));
        expect(applyMachines).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'm1' })],
            true,
        );
    });

    it('schedules an authoritative retry when machine decryption fails', async () => {
        const scheduleRetry = vi.fn();

        await runMachineSnapshotSync({
            generation: 5,
            assertCurrent: vi.fn(),
            existingMachines: { retained: {} as never },
            existingMachineIdsAtStart: ['retained'],
            runRequest: async (_generation, operation) => operation({
                signal: new AbortController().signal,
                assertCurrent: vi.fn(),
            }),
            fetchMachines: async () => [createMachineRecord('locked', 'wrapped-key')],
            encryption: {
                decryptEncryptionKey: vi.fn(async () => null),
                initializeMachines: vi.fn(async () => undefined),
                getMachineEncryption: vi.fn(),
            },
            setDataKey: vi.fn(),
            applyMachines: vi.fn(),
            scheduleRetry,
            onIgnoredEmptySnapshot: vi.fn(),
            log: vi.fn(),
        });

        expect(scheduleRetry).toHaveBeenCalledTimes(1);
    });

    it('does not apply a snapshot after the account generation becomes stale', async () => {
        let current = true;
        const applyMachines = vi.fn();

        await expect(runMachineSnapshotSync({
            generation: 6,
            existingMachines: {},
            existingMachineIdsAtStart: [],
            runRequest: async (_generation, operation) => {
                const result = await operation({
                    signal: new AbortController().signal,
                    assertCurrent: vi.fn(),
                });
                current = false;
                return result;
            },
            assertCurrent: () => {
                if (!current) throw new DOMException('Account lifecycle is stale', 'AbortError');
            },
            fetchMachines: async () => [],
            encryption: {
                decryptEncryptionKey: vi.fn(async () => null),
                initializeMachines: vi.fn(async () => undefined),
                getMachineEncryption: vi.fn(),
            },
            setDataKey: vi.fn(),
            applyMachines,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot: vi.fn(),
            log: vi.fn(),
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(applyMachines).not.toHaveBeenCalled();
    });
});
