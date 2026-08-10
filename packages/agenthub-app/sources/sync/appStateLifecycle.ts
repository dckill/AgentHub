import type { AppStateStatus } from 'react-native';

export function applyAppStateChange({
    nextAppState,
    setAppState,
    isAccountActive,
    onActive,
    onBackground,
}: {
    nextAppState: AppStateStatus;
    setAppState: (state: AppStateStatus) => void;
    isAccountActive: () => boolean;
    onActive: () => void;
    onBackground: (state: AppStateStatus) => void;
}): boolean {
    setAppState(nextAppState);
    if (!isAccountActive()) {
        return false;
    }
    if (nextAppState === 'active') {
        onActive();
    } else {
        onBackground(nextAppState);
    }
    return true;
}
