import type { AppStateStatus, PlatformOSType } from 'react-native';

export function canUseDeviceProtectedSecret(input: {
    platform: PlatformOSType;
    hasHardware: boolean;
    isEnrolled: boolean;
}): boolean {
    return (input.platform === 'ios' || input.platform === 'android')
        && input.hasHardware
        && input.isEnrolled;
}

export function shouldHideProtectedSecret(input: {
    isFocused: boolean;
    appState: AppStateStatus;
}): boolean {
    return !input.isFocused || input.appState !== 'active';
}

export function shouldClearProtectedClipboard(currentValue: string, protectedValue: string): boolean {
    return protectedValue.length > 0 && currentValue === protectedValue;
}
