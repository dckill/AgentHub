import { describe, expect, it, vi } from 'vitest';

import {
    applyArtifactDeleteRealtimeUpdate,
    applyMachineDeleteRealtimeUpdate,
} from './resourceDeleteRealtimeApplication';

describe('realtime resource delete application', () => {
    it('cleans a deleted machine through the canonical cleanup order', () => {
        const calls: string[] = [];

        applyMachineDeleteRealtimeUpdate('machine-1', {
            deleteMachine: vi.fn(() => calls.push('delete-machine')),
            removeMachineEncryption: vi.fn(() => calls.push('remove-encryption')),
            deleteDataKey: vi.fn(() => calls.push('delete-data-key')),
        });

        expect(calls).toEqual(['delete-machine', 'remove-encryption', 'delete-data-key']);
    });

    it('cleans a deleted artifact and removes its data key', () => {
        const deleteArtifact = vi.fn();
        const deleteDataKey = vi.fn();

        applyArtifactDeleteRealtimeUpdate('artifact-1', { deleteArtifact, deleteDataKey });

        expect(deleteArtifact).toHaveBeenCalledWith('artifact-1');
        expect(deleteDataKey).toHaveBeenCalledWith('artifact-1');
        expect(deleteArtifact.mock.invocationCallOrder[0]).toBeLessThan(deleteDataKey.mock.invocationCallOrder[0]);
    });
});
