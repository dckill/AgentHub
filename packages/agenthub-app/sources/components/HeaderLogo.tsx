import * as React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';

/**
 * Shared header logo component used across all main tabs.
 * Extracted to prevent flickering on tab switches - when each tab
 * had its own HeaderLeft, the component would unmount/remount.
 */
export const HeaderLogo = React.memo(() => {
    const { theme } = useUnistyles();
    return (
        <View style={{
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Image
                source={theme.dark ? require('@/assets/images/agenthub-logo-light.png') : require('@/assets/images/agenthub-logo-dark.png')}
                contentFit="contain"
                accessibilityLabel="AgentHub"
                style={{ width: 24, height: 24 }}
            />
        </View>
    );
});
