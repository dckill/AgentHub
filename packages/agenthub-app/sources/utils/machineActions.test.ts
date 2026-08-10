import { describe, expect, it } from 'vitest';

import {
    getMachineHeaderActionDescriptors,
    getVisibleDeviceMachines,
    sortMachinesOnlineFirst,
} from './machineActions';

describe('machineActions', () => {
    it('puts a single QR scanner, auth link, and group creation in the native device add menu', () => {
        expect(getMachineHeaderActionDescriptors({ canScanQr: true }).map((item) => item.id)).toEqual([
            'scan-qr-code',
            'enter-auth-link',
            'new-group',
        ]);
    });

    it('keeps non-camera actions available when QR scanning is unavailable', () => {
        expect(getMachineHeaderActionDescriptors({ canScanQr: false }).map((item) => item.id)).toEqual([
            'enter-auth-link',
            'new-group',
        ]);
    });

    it('keeps offline devices visible in the device list', () => {
        const machines = [
            { id: 'online', active: true },
            { id: 'offline', active: false },
        ];

        expect(getVisibleDeviceMachines(machines).map((machine) => machine.id)).toEqual(['online', 'offline']);
    });

    it('stably keeps online devices above offline devices inside every group', () => {
        const machines = [
            { id: 'offline-a', online: false },
            { id: 'online-a', online: true },
            { id: 'offline-b', online: false },
            { id: 'online-b', online: true },
        ];

        expect(sortMachinesOnlineFirst(machines, (machine) => machine.online).map((machine) => machine.id)).toEqual([
            'online-a',
            'online-b',
            'offline-a',
            'offline-b',
        ]);
        expect(machines.map((machine) => machine.id)).toEqual(['offline-a', 'online-a', 'offline-b', 'online-b']);
    });
});
