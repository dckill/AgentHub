import type { CliUpdateStatus } from '@artsum/agenthub-wire';
import type { Machine } from '@/sync/storageTypes';
import { isMachineOnline } from './machineUtils';

export type MachineCliUpdateView = {
    phase: CliUpdateStatus['phase'] | 'unsupported';
    currentVersion?: string;
    latestVersion?: string;
    targetVersion?: string;
    needsUpdate: boolean;
    canStartUpdate: boolean;
    isBusy: boolean;
    tone: 'success' | 'warning' | 'progress' | 'error' | 'muted';
    error?: string;
    unsupportedReason?: string;
    checkedAt?: number;
};

function isCliUpdateStatus(value: unknown): value is CliUpdateStatus {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<CliUpdateStatus>;
    return typeof candidate.phase === 'string'
        && typeof candidate.currentVersion === 'string'
        && typeof candidate.updateAvailable === 'boolean'
        && typeof candidate.canUpdate === 'boolean';
}

export function getMachineCliUpdateView(machine: Machine): MachineCliUpdateView {
    const daemonState = machine.daemonState as { cliUpdate?: unknown } | null;
    const status = daemonState?.cliUpdate;
    if (!isCliUpdateStatus(status)) {
        return {
            phase: 'unsupported',
            currentVersion: machine.metadata?.agentHubCliVersion,
            needsUpdate: false,
            canStartUpdate: false,
            isBusy: false,
            tone: 'muted',
        };
    }

    const isBusy = status.phase === 'checking' || status.phase === 'updating' || status.phase === 'restarting';
    const tone: MachineCliUpdateView['tone'] = status.phase === 'failed'
        ? 'error'
        : isBusy
            ? 'progress'
            : status.updateAvailable
                ? 'warning'
                : status.phase === 'up-to-date'
                    ? 'success'
                    : 'muted';

    return {
        phase: status.phase,
        currentVersion: status.currentVersion || machine.metadata?.agentHubCliVersion,
        latestVersion: status.latestVersion,
        targetVersion: status.targetVersion,
        needsUpdate: status.updateAvailable,
        canStartUpdate: status.updateAvailable && status.canUpdate && isMachineOnline(machine) && !isBusy,
        isBusy,
        tone,
        error: status.error,
        unsupportedReason: status.unsupportedReason,
        checkedAt: status.checkedAt,
    };
}
