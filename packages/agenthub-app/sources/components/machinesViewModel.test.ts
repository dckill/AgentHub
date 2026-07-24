import { describe, expect, it } from 'vitest';
import { buildMachinesViewModel } from './machinesViewModel';

describe('buildMachinesViewModel', () => {
    it.each([
        [{ dataReady: false, socketStatus: 'disconnected', visibleMachineCount: 0 }, 'loading', false],
        [{ dataReady: true, socketStatus: 'connecting', visibleMachineCount: 0 }, 'connecting', false],
        [{ dataReady: true, socketStatus: 'connecting', visibleMachineCount: 2 }, 'connecting', true],
        [{ dataReady: true, socketStatus: 'error', visibleMachineCount: 0 }, 'offline', false],
        [{ dataReady: true, socketStatus: 'disconnected', visibleMachineCount: 2 }, 'offline', true],
        [{ dataReady: true, socketStatus: 'connected', visibleMachineCount: 0 }, 'empty', false],
        [{ dataReady: true, socketStatus: 'connected', visibleMachineCount: 2 }, 'ready', true],
    ] as const)('projects %o to %s while preserving cached rows=%s', (input, state, showMachineList) => {
        expect(buildMachinesViewModel(input)).toEqual({ state, showMachineList });
    });
});
