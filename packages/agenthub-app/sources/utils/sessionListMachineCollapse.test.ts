import { describe, expect, it } from 'vitest';

import { filterCollapsedMachineProjects } from './sessionListMachineCollapse';

describe('sessionListMachineCollapse', () => {
    it('keeps machine separators visible while hiding projects under collapsed machines', () => {
        const items = [
            { type: 'machine-separator', machineId: 'm1', machineName: 'Laptop' },
            { type: 'project-group', project: { key: 'm1:/repo/a', machineId: 'm1' } },
            { type: 'project-group', project: { key: 'm1:/repo/b', machineId: 'm1' } },
            { type: 'machine-separator', machineId: 'm2', machineName: 'Server' },
            { type: 'project-group', project: { key: 'm2:/repo/c', machineId: 'm2' } },
        ] as any;

        expect(filterCollapsedMachineProjects(items, new Set(['m1']))).toEqual([
            { type: 'machine-separator', machineId: 'm1', machineName: 'Laptop' },
            { type: 'machine-separator', machineId: 'm2', machineName: 'Server' },
            { type: 'project-group', project: { key: 'm2:/repo/c', machineId: 'm2' } },
        ]);
    });
});
