export type MachineDeleteCleanup = {
    deleteMachine: (machineId: string) => void;
    removeMachineEncryption: (machineId: string) => void;
    deleteDataKey: (machineId: string) => void;
};

/** Remove a deleted machine and release every in-memory encryption resource. */
export function cleanupDeletedMachine(machineId: string, cleanup: MachineDeleteCleanup): void {
    cleanup.deleteMachine(machineId);
    cleanup.removeMachineEncryption(machineId);
    cleanup.deleteDataKey(machineId);
}
