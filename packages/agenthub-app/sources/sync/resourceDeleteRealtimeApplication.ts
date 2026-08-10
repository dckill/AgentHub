import {
    cleanupDeletedArtifact,
    type ArtifactDeleteCleanup,
} from './artifactDeleteCleanup';
import {
    cleanupDeletedMachine,
    type MachineDeleteCleanup,
} from './machineDeleteCleanup';

/** Apply a realtime machine deletion while keeping resource cleanup centralized. */
export function applyMachineDeleteRealtimeUpdate(
    machineId: string,
    cleanup: MachineDeleteCleanup,
): void {
    cleanupDeletedMachine(machineId, cleanup);
}

/** Apply a realtime artifact deletion while keeping key cleanup centralized. */
export function applyArtifactDeleteRealtimeUpdate(
    artifactId: string,
    cleanup: ArtifactDeleteCleanup,
): void {
    cleanupDeletedArtifact(artifactId, cleanup);
}
