import * as React from 'react';
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Text, View, ActivityIndicator, Pressable } from "react-native";
import { useMessage, useSession, useSessionMessages } from "@/sync/storage";
import { sync } from '@/sync/sync';
import { Deferred } from "@/components/Deferred";
import { ToolFullView } from '@/components/tools/ToolFullView';
import { ToolHeader } from '@/components/tools/ToolHeader';
import { ToolStatusIndicator } from '@/components/tools/ToolStatusIndicator';
import { Message } from '@/sync/typesMessage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { ScreenReaderHeading } from '@/components/ScreenReaderHeading';
import { t } from '@/text';

const stylesheet = StyleSheet.create((theme) => ({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullViewContainer: {
        flex: 1,
        padding: 16,
    },
    mainContainer: {
        flex: 1,
    },
    stateText: {
        marginTop: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    stateButton: {
        minWidth: 88,
        minHeight: 44,
        marginTop: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: theme.colors.button.primary.background,
    },
    stateButtonText: {
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
    messageText: {
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
        ...Typography.default(),
    },
}));

export default React.memo(() => {
    const { id: sessionId, messageId } = useLocalSearchParams<{ id: string; messageId: string }>();
    const router = useRouter();
    const session = useSession(sessionId!);
    const { isLoaded: messagesLoaded } = useSessionMessages(sessionId!);
    const message = useMessage(sessionId!, messageId!);
    const { theme } = useUnistyles();
    const styles = stylesheet;
    
    // Trigger session visibility when component mounts
    React.useEffect(() => {
        if (sessionId) {
            sync.onSessionVisible(sessionId);
        }
    }, [sessionId]);
    
    // Configure header for tool messages
    React.useLayoutEffect(() => {
        if (message && message.kind === 'tool-call' && message.tool) {
            // Header is configured in the Stack.Screen options
        }
    }, [message]);
    
    // Show loader while waiting for session and messages to load
    if (!session || !messagesLoaded) {
        return (
            <View role="main" accessibilityLabel={t('message.loading')} accessibilityLiveRegion="polite" style={styles.loadingContainer}>
                <ScreenReaderHeading title={t('common.message')} />
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                <Text style={styles.stateText}>{t('message.loading')}</Text>
            </View>
        );
    }
    
    if (!message) {
        return (
            <View role="main" style={styles.loadingContainer}>
                <Stack.Screen options={{ headerTitle: t('message.notFound') }} />
                <ScreenReaderHeading title={t('message.notFound')} />
                <View accessibilityRole="alert">
                    <Text style={styles.stateText}>{t('message.notFound')}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.stateButton}>
                    <Text style={styles.stateButtonText}>{t('common.back')}</Text>
                </Pressable>
            </View>
        );
    }
    
    return (
        <>
            {message && message.kind === 'tool-call' && message.tool && (
                <Stack.Screen
                    options={{
                        headerTitle: () => <ToolHeader tool={message.tool} />,
                        headerRight: () => <ToolStatusIndicator tool={message.tool} />,
                        headerStyle: {
                            backgroundColor: theme.colors.header.background,
                        },
                        headerTintColor: theme.colors.header.tint,
                        headerShadowVisible: false,
                    }}
                />
            )}
            <View role="main" style={styles.mainContainer}>
                <ScreenReaderHeading title={t('common.message')} />
                <Deferred>
                    <FullView message={message} />
                </Deferred>
            </View>
        </>
    );
});

function FullView(props: { message: Message }) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    
    if (props.message.kind === 'tool-call') {
        return <ToolFullView tool={props.message.tool} messages={props.message.children} />
    }
    if (props.message.kind === 'agent-text') {
        return (
            <View style={styles.fullViewContainer}>
                <Text style={styles.messageText}>{props.message.text}</Text>
            </View>
        )
    }
    if (props.message.kind === 'user-text') {
        return (
            <View style={styles.fullViewContainer}>
                <Text style={styles.messageText}>{props.message.text}</Text>
            </View>
        )
    }
    return null;
}
