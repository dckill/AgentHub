import { describe, expect, it } from 'vitest';

import {
    getMachineHeaderActionDescriptors,
    getVisibleDeviceMachines,
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
});
