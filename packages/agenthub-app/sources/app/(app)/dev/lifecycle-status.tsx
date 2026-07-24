import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { Typography } from '@/constants/Typography';
import { getSessionLifecycleVisual } from '@/utils/sessionLifecycleStatus';
import { useUnistyles } from 'react-native-unistyles';

const timeoutVisual = getSessionLifecycleVisual('timeout');

export default function LifecycleStatusQaScreen() {
    const { theme } = useUnistyles();
    if (!timeoutVisual) return null;

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.screen, { backgroundColor: theme.colors.surface }]}>
                <ChatHeaderView
                    title="Lifecycle Status QA"
                    agentLabel="Native QA"
                    lifecycleStatus={{
                        ...timeoutVisual,
                        label: 'Stop timed out',
                    }}
                />
                <View style={styles.content}>
                    <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>FAILURE RECOVERY</Text>
                    <Text style={[styles.title, { color: theme.colors.text }]}>Lifecycle Status QA</Text>
                    <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
                        Preview-only native fixture for the same lifecycle badge rendered by an authenticated session.
                        The timeout status must be exposed as one polite accessibility live region.
                    </Text>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingBottom: 72,
        gap: 12,
    },
    eyebrow: {
        ...Typography.default('semiBold'),
        fontSize: 11,
        letterSpacing: 1.6,
    },
    title: {
        ...Typography.default('semiBold'),
        fontSize: 28,
        lineHeight: 34,
    },
    body: {
        ...Typography.default(),
        maxWidth: 520,
        fontSize: 15,
        lineHeight: 22,
    },
});
