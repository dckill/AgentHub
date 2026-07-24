import type { Machine } from '@/sync/storageTypes';
import { isMachineOnline } from './machineUtils';
import { resolveAbsolutePath } from './pathUtils';

export type MachineDetailDaemonStatus = 'unknown' | 'stopped' | 'likely alive';

export function getMachineDetailDaemonStatus(machine: Machine | null | undefined): MachineDetailDaemonStatus {
    if (!machine) return 'unknown';

    const metadata = machine.metadata;
    const daemonState = machine.daemonState as { status?: string } | null;
    if (metadata?.daemonLastKnownStatus === 'shutting-down' || daemonState?.status === 'shutting-down') {
        return 'stopped';
    }

    return isMachineOnline(machine) ? 'likely alive' : 'stopped';
}

export function isMachineDetailSpawnDisabled(options: {
    customPath: string;
    isOnline: boolean;
    isSpawning: boolean;
}): boolean {
    return options.isSpawning || !options.isOnline;
}

export function getMachineDetailSpawnPath(customPath: string, homeDir?: string): string {
    return resolveAbsolutePath(customPath.trim() || '~', homeDir);
}

export function finishMachineDetailSpawnSuccess(
    router: { back: () => void },
    navigateToSession: (sessionId: string) => void,
    sessionId: string,
) {
    router.back();
    navigateToSession(sessionId);
}

export function openNewSessionForMachine(options: {
    draft: { setMachineId: (machineId: string) => void };
    router: { push: (path: '/new') => void };
    machineId: string;
}) {
    options.draft.setMachineId(options.machineId);
    options.router.push('/new');
}

export function removeMachineFromGroups(
    machineGroups: Record<string, string>,
    machineId: string,
): Record<string, string> {
    if (!(machineId in machineGroups)) {
        return machineGroups;
    }

    const { [machineId]: _removed, ...remaining } = machineGroups;
    return remaining;
}
