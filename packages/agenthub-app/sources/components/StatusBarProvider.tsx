import React from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useUnistyles } from 'react-native-unistyles';
import { getStatusBarVisuals } from './navigationShellVisuals';


export const StatusBarProvider = React.memo(() => {
    const { theme } = useUnistyles();
    const statusBarVisuals = getStatusBarVisuals(theme);
    React.useEffect(() => {
        SystemUI.setBackgroundColorAsync(statusBarVisuals.backgroundColor);
    }, [statusBarVisuals.backgroundColor]);

    return (
        <StatusBar
            style={statusBarVisuals.style}
            backgroundColor={statusBarVisuals.backgroundColor}
            animated={true}
        />
    );
});
