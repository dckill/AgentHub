import { describe, expect, it, vi } from 'vitest';
import type { Machine } from '@/sync/storageTypes';
import {
    finishMachineDetailSpawnSuccess,
    getMachineDetailDaemonStatus,
    getMachineDetailSpawnPath,
    isMachineDetailSpawnDisabled,
    openNewSessionForMachine,
    removeMachineFromGroups,
} from './machineDetail';

function makeMachine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadataVersion: 1,
        daemonStateVersion: 1,
        metadata: {
            host: 'devbox',
            platform: 'darwin',
            agentHubCliVersion: '1.0.0',
            agentHubHomeDir: '/Users/dev/.agenthub',
            homeDir: '/Users/dev',
        },
        daemonState: null,
        ...overrides,
    };
}

describe('machine detail helpers', () => {
    describe('getMachineDetailDaemonStatus', () => {
        it('treats daemonState shutting-down as stopped even before machine presence times out', () => {
            const machine = makeMachine({
                active: true,
                daemonState: { status: 'shutting-down', shutdownRequestedAt: 123 },
            });

            expect(getMachineDetailDaemonStatus(machine)).toBe('stopped');
        });

        it('keeps active machines without shutdown state likely alive', () => {
            expect(getMachineDetailDaemonStatus(makeMachine({ active: true }))).toBe('likely alive');
        });

        it('treats inactive machines as stopped', () => {
            expect(getMachineDetailDaemonStatus(makeMachine({ active: false }))).toBe('stopped');
        });
    });

    describe('machine detail spawn path', () => {
        it('allows starting a session with an empty path by defaulting to home', () => {
            expect(isMachineDetailSpawnDisabled({ customPath: '', isOnline: true, isSpawning: false })).toBe(false);
            expect(getMachineDetailSpawnPath('', '/Users/dev')).toBe('/Users/dev');
        });

        it('disables spawning while offline or already spawning', () => {
            expect(isMachineDetailSpawnDisabled({ customPath: '~/Code', isOnline: false, isSpawning: false })).toBe(true);
            expect(isMachineDetailSpawnDisabled({ customPath: '~/Code', isOnline: true, isSpawning: true })).toBe(true);
        });
    });

    describe('finishMachineDetailSpawnSuccess', () => {
        it('dismisses only the machine detail route before opening the new session', () => {
            const router = { back: vi.fn() };
            const navigateToSession = vi.fn();

            finishMachineDetailSpawnSuccess(router, navigateToSession, 'session-1');

            expect(router.back).toHaveBeenCalledTimes(1);
            expect(navigateToSession).toHaveBeenCalledWith('session-1');
        });
    });

    describe('openNewSessionForMachine', () => {
        it('preselects the machine and opens the full new session screen', () => {
            const draft = { setMachineId: vi.fn() };
            const router = { push: vi.fn() };

            openNewSessionForMachine({
                draft,
                router,
                machineId: 'machine-1',
            });

            expect(draft.setMachineId).toHaveBeenCalledWith('machine-1');
            expect(router.push).toHaveBeenCalledWith('/new');
        });
    });

    describe('removeMachineFromGroups', () => {
        it('removes deleted machine assignments without mutating other groups', () => {
            const groups = {
                'machine-1': 'Work',
                'machine-2': 'Personal',
            };

            expect(removeMachineFromGroups(groups, 'machine-1')).toEqual({
                'machine-2': 'Personal',
            });
            expect(groups).toEqual({
                'machine-1': 'Work',
                'machine-2': 'Personal',
            });
        });
    });
});
