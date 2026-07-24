import { describe, expect, it } from 'vitest';
import type { Machine } from '@/sync/storageTypes';
import { getMachineCliUpdateView } from './cliUpdate';

function machine(daemonState: unknown, active = true): Machine {
    return {
        id: 'machine-1', seq: 1, createdAt: 1, updatedAt: 1, active, activeAt: 1,
        metadataVersion: 1, daemonStateVersion: 1,
        metadata: {
            host: 'devbox', platform: 'linux', agentHubCliVersion: '1.1.4',
            agentHubHomeDir: '/home/dev/.agenthub', homeDir: '/home/dev',
        },
        daemonState,
    };
}

describe('machine CLI update view model', () => {
    it('marks an online device with a newer release as actionable', () => {
        expect(getMachineCliUpdateView(machine({
            cliUpdate: {
                phase: 'available', currentVersion: '1.1.4', latestVersion: '1.2.0',
                updateAvailable: true, canUpdate: true, checkedAt: 123,
            },
        }))).toMatchObject({
            currentVersion: '1.1.4', latestVersion: '1.2.0', needsUpdate: true,
            canStartUpdate: true, tone: 'warning', phase: 'available',
        });
    });

    it('keeps an offline last-known update visible but disables the action', () => {
        expect(getMachineCliUpdateView(machine({
            cliUpdate: {
                phase: 'available', currentVersion: '1.1.4', latestVersion: '1.2.0',
                updateAvailable: true, canUpdate: true,
            },
        }, false))).toMatchObject({ needsUpdate: true, canStartUpdate: false });
    });

    it('identifies old daemons that do not publish update capability', () => {
        expect(getMachineCliUpdateView(machine(null))).toMatchObject({
            currentVersion: '1.1.4', phase: 'unsupported', needsUpdate: false,
            canStartUpdate: false, tone: 'muted',
        });
    });

    it('surfaces update failures without losing the target version', () => {
        expect(getMachineCliUpdateView(machine({
            cliUpdate: {
                phase: 'failed', currentVersion: '1.1.4', latestVersion: '1.2.0', targetVersion: '1.2.0',
                updateAvailable: true, canUpdate: true, error: 'permission denied',
            },
        }))).toMatchObject({ phase: 'failed', targetVersion: '1.2.0', error: 'permission denied', tone: 'error' });
    });
});
