import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useUnistyles } from 'react-native-unistyles';
import { ActionMenu, type ActionMenuAnchor, type ActionMenuItem } from '@/components/ActionMenu';
import { GlassButton, GlassSurface, StatusChip } from '@/components/glass';
import { Typography } from '@/constants/Typography';

function getAnchorFromEvent(event: any): ActionMenuAnchor {
    const nativeEvent = event?.nativeEvent ?? {};
    return {
        type: 'rect',
        x: nativeEvent.pageX ?? 24,
        y: nativeEvent.pageY ?? 120,
        width: 44,
        height: 36,
    };
}

export default function ActionMenuDemoScreen() {
    const { theme } = useUnistyles();
    const [anchor, setAnchor] = React.useState<ActionMenuAnchor | null>(null);
    const [lastAction, setLastAction] = React.useState('No menu action yet');

    const items = React.useMemo<ActionMenuItem[]>(() => [
        {
            id: 'resume',
            icon: 'play-circle-outline',
            label: 'Resume session',
            selected: true,
            onPress: () => setLastAction('Resume session'),
        },
        {
            id: 'details',
            icon: 'information-circle-outline',
            label: 'Open details',
            onPress: () => setLastAction('Open details'),
        },
        {
            id: 'copy',
            icon: 'copy-outline',
            label: 'Copy metadata',
            onPress: () => setLastAction('Copy metadata'),
        },
        {
            id: 'disabled',
            icon: 'cloud-offline-outline',
            label: 'Unavailable action',
            disabled: true,
            onPress: () => setLastAction('Unavailable action'),
        },
        {
            id: 'archive',
            icon: 'archive-outline',
            label: 'Archive session',
            destructive: true,
            onPress: () => setLastAction('Archive session'),
        },
    ], []);

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.colors.canvas }]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.colors.text }, Typography.default('semiBold')]}>
                    Action Menu Demo
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.textSecondary }, Typography.default()]}>
                    AgentHub glass menu states for web anchors and centered native fallback.
                </Text>
            </View>

            <GlassSurface tone="raised" style={styles.previewPanel}>
                <View style={styles.previewHeader}>
                    <View style={styles.previewTitleGroup}>
                        <Text style={[styles.previewTitle, { color: theme.colors.text }, Typography.default('semiBold')]}>
                            AgentHub session
                        </Text>
                        <Text style={[styles.previewMeta, { color: theme.colors.textSecondary }, Typography.default()]}>
                            /workspace/agenthub/refactor
                        </Text>
                    </View>
                    <StatusChip label="运行中" tone="running" />
                </View>

                <Text style={[styles.previewBody, { color: theme.colors.textSecondary }, Typography.default()]}>
                    Open the action menu to verify selected, disabled, destructive, hover, and glass panel treatment.
                </Text>

                <View style={styles.actionRow}>
                    <GlassButton
                        title="Open menu"
                        variant="primary"
                        onPress={(event) => setAnchor(getAnchorFromEvent(event))}
                    />
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open compact menu"
                        onPress={(event) => setAnchor(getAnchorFromEvent(event))}
                        style={({ pressed }) => [
                            styles.iconButton,
                            {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.glass.background,
                                opacity: pressed ? 0.78 : 1,
                            },
                        ]}
                    >
                        <Ionicons name="ellipsis-horizontal" size={19} color={theme.colors.accent} />
                    </Pressable>
                </View>
            </GlassSurface>

            <GlassSurface tone="default" style={styles.resultPanel}>
                <Text style={[styles.resultLabel, { color: theme.colors.textSecondary }, Typography.default('semiBold')]}>
                    Last action
                </Text>
                <Text style={[styles.resultText, { color: theme.colors.accent }, Typography.default()]}>
                    {lastAction}
                </Text>
            </GlassSurface>

            <ActionMenu
                anchor={anchor}
                items={items}
                onClose={() => setAnchor(null)}
                title="Session actions"
                visible={!!anchor}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 20,
        gap: 6,
    },
    title: {
        fontSize: 24,
        lineHeight: 30,
    },
    subtitle: {
        fontSize: 14,
        lineHeight: 20,
    },
    previewPanel: {
        marginHorizontal: 20,
        marginTop: 4,
        padding: 18,
        borderRadius: 18,
        gap: 16,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
    },
    previewTitleGroup: {
        flex: 1,
        minWidth: 0,
    },
    previewTitle: {
        fontSize: 18,
        lineHeight: 24,
    },
    previewMeta: {
        marginTop: 3,
        fontSize: 13,
        lineHeight: 18,
    },
    previewBody: {
        fontSize: 15,
        lineHeight: 22,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconButton: {
        width: 42,
        height: 42,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resultPanel: {
        marginHorizontal: 20,
        marginTop: 18,
        padding: 16,
        borderRadius: 16,
        gap: 6,
    },
    resultLabel: {
        fontSize: 12,
        lineHeight: 16,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    resultText: {
        fontSize: 15,
        lineHeight: 22,
    },
});
