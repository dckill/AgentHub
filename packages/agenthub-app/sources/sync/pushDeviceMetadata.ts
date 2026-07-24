import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export interface CurrentPushDeviceMetadata {
    deviceLabel: string;
    appLabel: string | null;
}

export function getCurrentPushDeviceMetadata(): CurrentPushDeviceMetadata {
    const deviceParts = [
        Device.deviceName,
        Device.modelName && Device.modelName !== Device.deviceName ? Device.modelName : null,
        [Device.osName ?? Platform.OS, Device.osVersion].filter(Boolean).join(' '),
    ].filter((value): value is string => !!value && value.trim().length > 0);

    const appParts = [
        Application.nativeApplicationVersion ? `AgentHub ${Application.nativeApplicationVersion}` : null,
        Application.nativeBuildVersion ? `build ${Application.nativeBuildVersion}` : null,
        Device.isDevice === false ? 'simulator' : null,
    ].filter((value): value is string => !!value);

    return {
        deviceLabel: deviceParts.join(' • ') || `${Platform.OS} device`,
        appLabel: appParts.length > 0 ? appParts.join(' • ') : null,
    };
}
