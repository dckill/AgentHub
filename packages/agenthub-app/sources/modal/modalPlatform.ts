export type ModalPlatform = 'ios' | 'android' | 'web' | 'macos' | 'windows' | 'native';
export type RoutedModalType = 'alert' | 'confirm' | 'prompt';

export function shouldUseCustomModal(platform: ModalPlatform | string, type: RoutedModalType): boolean {
    if (type === 'prompt') {
        return platform !== 'ios';
    }

    return platform === 'android' || platform === 'web';
}
