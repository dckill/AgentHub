import { describe, expect, it, vi } from 'vitest';
import { cleanupDeletedMachine } from './machineDeleteCleanup';

describe('cleanupDeletedMachine', () => {
    it('clears storage, encryption and data key in order', () => {
        const calls: string[] = [];
        const deleteMachine = vi.fn(() => calls.push('machine'));
        const removeMachineEncryption = vi.fn(() => calls.push('encryption'));
        const deleteDataKey = vi.fn(() => calls.push('data-key'));

        cleanupDeletedMachine('machine-1', {
            deleteMachine,
            removeMachineEncryption,
            deleteDataKey,
        });

        expect(calls).toEqual(['machine', 'encryption', 'data-key']);
        expect(deleteMachine).toHaveBeenCalledWith('machine-1');
        expect(removeMachineEncryption).toHaveBeenCalledWith('machine-1');
        expect(deleteDataKey).toHaveBeenCalledWith('machine-1');
    });
});
