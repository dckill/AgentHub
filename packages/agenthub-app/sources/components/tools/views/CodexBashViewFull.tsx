import * as React from 'react';
import { View, Text, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { CommandView } from '@/components/CommandView';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { stringifyToolCommand } from '@/utils/toolCommand';
import { parseBashToolResult } from '@/utils/terminalResult';

interface CodexBashViewFullProps {
    tool: ToolCall;
    metadata: Metadata | null;
}

function formatDuration(durationMs: number | null): string | null {
    if (durationMs == null) {
        return null;
    }
    if (durationMs < 1000) {
        return `${durationMs} ms`;
    }
    return `${(durationMs / 1000).toFixed(1)} s`;
}

function getCommandDisplay(input: any): string {
    const parsedCmd = input?.parsed_cmd;
    if (Array.isArray(parsedCmd) && parsedCmd.length > 0) {
        const command = parsedCmd
            .map((item) => typeof item?.cmd === 'string' ? item.cmd : null)
            .filter(Boolean)
            .join('\n');
        if (command) {
            return command;
        }
    }

    return stringifyToolCommand(input?.command) || '';
}

function getStatusLabel(state: ToolCall['state']): string {
    switch (state) {
        case 'running':
            return t('tools.fullView.running');
        case 'completed':
            return t('tools.fullView.completed');
        case 'error':
            return t('tools.fullView.error');
    }
}

const MetaPill = React.memo(function MetaPill(props: { label: string; value: string; flex?: number }) {
    const { theme } = useUnistyles();
    return (
        <View style={[styles.metaPill, { flex: props.flex ?? 1, backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.divider }]}>
            <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>{props.label}</Text>
            <Text style={[styles.metaValue, { color: theme.colors.text }]} numberOfLines={1} ellipsizeMode="tail">{props.value}</Text>
        </View>
    );
});

export const CodexBashViewFull = React.memo<CodexBashViewFullProps>(({ tool }) => {
    const { theme } = useUnistyles();
    const parsed = parseBashToolResult({
        state: tool.state,
        result: tool.result,
        startedAt: tool.startedAt,
        completedAt: tool.completedAt,
    });
    const commandDisplay = getCommandDisplay(tool.input);
    const duration = formatDuration(parsed.durationMs);

    return (
        <View style={styles.container}>
            <View style={styles.metaRow}>
                <MetaPill label={t('tools.fullView.status')} value={getStatusLabel(tool.state)} flex={2} />
                {parsed.exitCode != null && (
                    <MetaPill label={t('tools.fullView.exitCode')} value={String(parsed.exitCode)} />
                )}
                {duration && (
                    <MetaPill label={t('tools.fullView.duration')} value={duration} />
                )}
            </View>

            <View style={styles.sectionHeader}>
                <Ionicons name="terminal-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{t('tools.fullView.command')}</Text>
            </View>

            <View style={styles.commandWrapper}>
                <CommandView
                    command={commandDisplay}
                    stdout={parsed.stdout}
                    stderr={parsed.stderr}
                    error={parsed.error}
                    fullWidth
                />
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 14,
        paddingTop: 20,
        paddingBottom: 64,
        gap: 16,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        gap: 8,
    },
    metaPill: {
        minHeight: 46,
        minWidth: 0,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    metaLabel: {
        fontSize: 11,
        marginBottom: 2,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    },
    metaValue: {
        fontSize: 14,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    commandWrapper: {
        flex: 1,
        minWidth: '100%',
    },
}));
