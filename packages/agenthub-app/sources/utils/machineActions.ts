export type MachineHeaderActionId =
    | 'scan-qr-code'
    | 'enter-auth-link'
    | 'new-group';

export interface MachineHeaderActionDescriptor {
    id: MachineHeaderActionId;
    icon: string;
    labelKey:
        | 'settings.scanQrCodeToAuthenticate'
        | 'connect.enterUrlManually'
        | 'machines.newGroup';
}

const QR_ACTIONS: MachineHeaderActionDescriptor[] = [
    {
        id: 'scan-qr-code',
        icon: 'qr-code-outline',
        labelKey: 'settings.scanQrCodeToAuthenticate',
    },
];

const ALWAYS_AVAILABLE_ACTIONS: MachineHeaderActionDescriptor[] = [
    {
        id: 'enter-auth-link',
        icon: 'link-outline',
        labelKey: 'connect.enterUrlManually',
    },
    {
        id: 'new-group',
        icon: 'folder-outline',
        labelKey: 'machines.newGroup',
    },
];

export function getMachineHeaderActionDescriptors(options: { canScanQr: boolean }): MachineHeaderActionDescriptor[] {
    return options.canScanQr
        ? [...QR_ACTIONS, ...ALWAYS_AVAILABLE_ACTIONS]
        : ALWAYS_AVAILABLE_ACTIONS;
}

export function getVisibleDeviceMachines<T>(machines: T[]): T[] {
    return machines;
}
