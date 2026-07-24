export interface CurrentPushDeviceMetadata {
    deviceLabel: string;
    appLabel: string | null;
}

export function getCurrentPushDeviceMetadata(): CurrentPushDeviceMetadata {
    return { deviceLabel: 'web device', appLabel: null };
}
