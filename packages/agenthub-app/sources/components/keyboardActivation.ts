import { Platform } from 'react-native';
import { activateOnSpaceKey, type KeyboardEventLike } from '@/components/keyboardActivationCore';

export function getSpaceKeyActivationProps(onActivate: () => void): {
    onKeyDown?: (event: KeyboardEventLike) => void;
} {
    if (Platform.OS !== 'web') {
        return {};
    }

    return {
        onKeyDown: (event) => {
            activateOnSpaceKey(event, onActivate);
        },
    };
}

export { activateOnSpaceKey } from '@/components/keyboardActivationCore';
