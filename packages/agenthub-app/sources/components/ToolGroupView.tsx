import * as React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import {
    AgentWorkGroupItem,
    ToolGroupItem,
    ToolDisplayItem,
    formatWorkDuration,
    formatAgentWorkSummaryLabel,
    getAgentWorkSummary,
    generateGroupSummary,
    groupToolCallsForDisplay,
} from '@/hooks/useGroupedMessages';
import { MessageView } from './MessageView';
import { Metadata } from '@/sync/storageTypes';
import { layout } from './layout';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { t } from '@/text';
import { Message, ToolCallMessage } from '@/sync/typesMessage';
import { getToolSummaryCategory, getToolSummaryDetail, ToolSummaryCategory } from '@/utils/toolDisplay';
import { useRouter } from 'expo-router';
import { formatMCPTitle } from './tools/views/MCPToolView';
import { GlassSurface, StatusChip } from '@/components/glass';
import { getToolStateLabel, getToolStateTone, getToolSurfaceVisuals } from './messageSurfaceVisuals';
import { getAccessibleActionProps } from './accessibilityProps';
import { resolveCollapsedGroupIds, type GroupCollapseOverrides } from './groupCollapseState';

interface ToolGroupViewProps {
    group: ToolGroupItem;
    metadata: Metadata | null;
    sessionId: string;
    expanded: boolean;
    onToggle: () => void;
    nested?: boolean;
    hideSingleToolChildren?: boolean;
}

export const ToolGroupView = React.memo<ToolGroupViewProps>((props) => {
    const { group, metadata, sessionId, expanded, onToggle, nested, hideSingleToolChildren } = props;
    const { theme } = useUnistyles();
    const router = useRouter();
    const toolSurfaceVisuals = getToolSurfaceVisuals(theme);
    const summary = React.useMemo(() => generateGroupSummary(group.messages), [group.messages]);
    const summaryCategory = React.useMemo(() => getGroupSummaryCategory(group.messages), [group.messages]);
    const suppressChildren = hideSingleToolChildren && group.messages.length === 1 && group.messages[0]?.kind === 'tool-call';
    const singleToolMessage = suppressChildren && group.messages[0]?.kind === 'tool-call'
        ? group.messages[0]
        : null;
    const handleSingleToolPress = React.useCallback(() => {
        if (!singleToolMessage) {
            onToggle();
            return;
        }
        const filePath = isFileEditTool(singleToolMessage.tool.name) && typeof singleToolMessage.tool.input?.file_path === 'string'
            ? singleToolMessage.tool.input.file_path
            : null;
        if (filePath) {
            router.push(`/session/${sessionId}/file?path=${btoa(filePath)}`);
            return;
        }
        router.push(`/session/${sessionId}/message/${singleToolMessage.id}`);
    }, [onToggle, router, sessionId, singleToolMessage]);
    const renderGroupMessage = React.useCallback((msg: Message) => (
        <ToolGroupMessageRow
            key={msg.id}
            message={msg}
            metadata={metadata}
            sessionId={sessionId}
        />
    ), [metadata, sessionId]);

    const body = (
        <GlassSurface
            tone="raised"
            style={[
                nested ? styles.nestedInnerContainer : styles.innerContainer,
                {
                    backgroundColor: toolSurfaceVisuals.backgroundColor,
                    borderColor: toolSurfaceVisuals.borderColor,
                    shadowColor: toolSurfaceVisuals.shadowColor,
                },
            ]}
        >
            <CollapseHeader
                expanded={expanded}
                hasRunning={group.hasRunning}
                label={summary}
                onPress={singleToolMessage ? handleSingleToolPress : onToggle}
                category={summaryCategory}
                interaction={singleToolMessage ? 'navigation' : 'disclosure'}
            />
            {expanded && !suppressChildren && (
                <View style={styles.content}>
                    {group.messages.map(renderGroupMessage)}
                </View>
            )}
        </GlassSurface>
    );

    if (nested) {
        return (
            <View style={styles.nestedOuterContainer}>
                {body}
            </View>
        );
    }

    return (
        <View style={styles.outerContainer}>
            {body}
        </View>
    );
});

interface AgentWorkGroupViewProps {
    group: AgentWorkGroupItem;
    metadata: Metadata | null;
    sessionId: string;
    expanded: boolean;
    onToggle: () => void;
}

export const AgentWorkGroupView = React.memo<AgentWorkGroupViewProps>((props) => {
    const { group, metadata, sessionId, expanded, onToggle } = props;
    const { theme } = useUnistyles();
    const toolSurfaceVisuals = getToolSurfaceVisuals(theme);
    const runningElapsedSeconds = useElapsedTime(group.completedAt === null ? group.startedAt : null);
    const durationMs = group.completedAt === null
        ? runningElapsedSeconds * 1000
        : group.completedAt - group.startedAt;
    const summary = React.useMemo(
        () => getAgentWorkSummary(group.messages, group.startedAt, group.completedAt),
        [group.completedAt, group.messages, group.startedAt],
    );
    const label = formatAgentWorkSummaryLabel(summary, formatWorkDuration(durationMs));
    const nestedItemsNewestFirst = React.useMemo(
        () => groupToolCallsForDisplay(group.messages, true, { groupSingleToolCalls: true }),
        [group.messages],
    );
    const nestedItems = React.useMemo(
        () => [...nestedItemsNewestFirst].reverse(),
        [nestedItemsNewestFirst],
    );

    const nestedCollapseSessionId = `${sessionId}:${group.id}`;
    const [nestedCollapseOverrides, setNestedCollapseOverrides] = React.useState<GroupCollapseOverrides | null>(null);
    const collapsedToolGroups = React.useMemo(
        () => resolveCollapsedGroupIds(nestedItemsNewestFirst, nestedCollapseOverrides, nestedCollapseSessionId),
        [nestedCollapseOverrides, nestedCollapseSessionId, nestedItemsNewestFirst],
    );

    const handleToggleNestedGroup = React.useCallback((groupId: string) => {
        setNestedCollapseOverrides((prev) => {
            const values = prev?.sessionId === nestedCollapseSessionId
                ? new Map(prev.values)
                : new Map<string, boolean>();
            values.set(groupId, !collapsedToolGroups.has(groupId));
            return { sessionId: nestedCollapseSessionId, values };
        });
    }, [collapsedToolGroups, nestedCollapseSessionId]);

    const renderNestedItem = React.useCallback((item: ToolDisplayItem) => {
        if (item.type === 'tool-group') {
            return (
                <ToolGroupView
                    key={item.id}
                    group={item}
                    metadata={metadata}
                    sessionId={sessionId}
                    expanded={!collapsedToolGroups.has(item.id)}
                    onToggle={() => handleToggleNestedGroup(item.id)}
                    nested
                    hideSingleToolChildren
                />
            );
        }
        return (
            <MessageView
                key={item.id}
                message={item.message}
                metadata={metadata}
                sessionId={sessionId}
            />
        );
    }, [collapsedToolGroups, handleToggleNestedGroup, metadata, sessionId]);

    return (
        <View style={styles.outerContainer}>
            <GlassSurface
                tone="raised"
                style={[
                    styles.innerContainer,
                    {
                        backgroundColor: toolSurfaceVisuals.backgroundColor,
                        borderColor: toolSurfaceVisuals.borderColor,
                        shadowColor: toolSurfaceVisuals.shadowColor,
                    },
                ]}
            >
                <CollapseHeader
                    expanded={expanded}
                    hasRunning={group.hasRunning}
                    label={label}
                    onPress={onToggle}
                    interaction="disclosure"
                />
                {expanded && (
                    <View style={styles.content}>
                        {nestedItems.map(renderNestedItem)}
                    </View>
                )}
            </GlassSurface>
        </View>
    );
});

function CollapseHeader(props: {
    expanded: boolean;
    hasRunning: boolean;
    label: string;
    onPress: () => void;
    category?: ToolSummaryCategory | null;
    disabled?: boolean;
    interaction: 'disclosure' | 'navigation';
}) {
    const { theme } = useUnistyles();
    const content = (
        <>
            {props.category ? (
                <View style={styles.headerIcon}>
                    <ToolSummaryIcon category={props.category} color={theme.colors.textSecondary} />
                </View>
            ) : null}
            <Text style={styles.summaryText} numberOfLines={1}>
                {props.label}
            </Text>
            {props.hasRunning && (
                <ActivityIndicator
                    size="small"
                    color={theme.colors.textSecondary}
                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                />
            )}
            <Ionicons
                name={props.interaction === 'disclosure' && props.expanded ? 'chevron-down' : 'chevron-forward'}
                size={13}
                color={theme.colors.textSecondary}
            />
        </>
    );

    if (props.disabled) {
        return (
            <View style={styles.header}>
                {content}
            </View>
        );
    }

    return (
        <Pressable
            onPress={props.onPress}
            {...(
                props.interaction === 'disclosure'
                    ? getAccessibleActionProps(props.label, { expanded: props.expanded })
                    : { ...getAccessibleActionProps(props.label), accessibilityRole: 'link' as const }
            )}
            style={({ pressed }) => [
                styles.header,
                pressed && styles.headerPressed,
            ]}
        >
            {content}
        </Pressable>
    );
}

function ToolGroupMessageRow(props: {
    message: Message;
    metadata: Metadata | null;
    sessionId: string;
}) {
    if (props.message.kind !== 'tool-call') {
        return (
            <MessageView
                message={props.message}
                metadata={props.metadata}
                sessionId={props.sessionId}
            />
        );
    }

    const shouldRenderFullTool = props.message.tool.permission?.status === 'pending'
        || props.message.tool.name === 'AskUserQuestion';
    if (shouldRenderFullTool) {
        return (
            <MessageView
                message={props.message}
                metadata={props.metadata}
                sessionId={props.sessionId}
            />
        );
    }

    return (
        <ToolSummaryRow
            message={props.message}
            sessionId={props.sessionId}
        />
    );
}

function ToolSummaryRow(props: {
    message: ToolCallMessage;
    sessionId: string;
}) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { tool } = props.message;
    const category = getToolSummaryCategory(tool.name);
    const detail = getToolSummaryDetail(tool);
    const title = getToolRowTitle(category, tool.name);
    const filePath = isFileEditTool(tool.name) && typeof tool.input?.file_path === 'string'
        ? tool.input.file_path
        : null;
    const isPressable = Boolean(props.sessionId);
    const handlePress = React.useCallback(() => {
        if (filePath) {
            router.push(`/session/${props.sessionId}/file?path=${btoa(filePath)}`);
            return;
        }
        router.push(`/session/${props.sessionId}/message/${props.message.id}`);
    }, [filePath, props.message.id, props.sessionId, router]);

    const content = (
        <>
            <View style={styles.toolSummaryIcon}>
                <ToolSummaryIcon category={category} color={theme.colors.textSecondary} />
            </View>
            <Text style={styles.toolSummaryTitle} numberOfLines={1}>
                {title}
            </Text>
            <StatusChip label={getToolStateLabel(tool.state)} tone={getToolStateTone(tool.state)} style={styles.toolSummaryStateChip} />
            {detail ? (
                <View style={styles.toolSummaryDetailPill}>
                    <Text style={styles.toolSummaryDetailText} numberOfLines={1}>
                        {detail}
                    </Text>
                </View>
            ) : null}
        </>
    );

    if (!isPressable) {
        return (
            <View style={styles.toolSummaryRow}>
                {content}
            </View>
        );
    }

    return (
        <Pressable
            onPress={handlePress}
            style={({ pressed }) => [
                styles.toolSummaryRow,
                pressed && styles.toolSummaryRowPressed,
            ]}
        >
            {content}
        </Pressable>
    );
}

function ToolSummaryIcon(props: {
    category: ToolSummaryCategory;
    color: string;
}) {
    switch (props.category) {
        case 'terminal':
            return <Octicons name="terminal" size={12} color={props.color} />;
        case 'edit':
            return <Octicons name="file-diff" size={12} color={props.color} />;
        case 'read':
            return <Octicons name="eye" size={12} color={props.color} />;
        case 'search':
            return <Octicons name="search" size={12} color={props.color} />;
        case 'web':
            return <Ionicons name="globe-outline" size={13} color={props.color} />;
        case 'task':
            return <Octicons name="rocket" size={12} color={props.color} />;
        default:
            return <Ionicons name="construct-outline" size={13} color={props.color} />;
    }
}

function getGroupSummaryCategory(messages: Message[]): ToolSummaryCategory | null {
    const categories = new Set<ToolSummaryCategory>();
    for (const message of messages) {
        if (message.kind === 'tool-call') {
            categories.add(getToolSummaryCategory(message.tool.name));
        }
    }
    if (categories.size === 1) {
        return categories.values().next().value ?? null;
    }
    return categories.size > 1 ? 'other' : null;
}

function getToolRowTitle(category: ToolSummaryCategory, toolName: string): string {
    if (toolName.startsWith('mcp__')) {
        return formatMCPTitle(toolName);
    }

    switch (category) {
        case 'terminal':
            return t('tools.names.terminal');
        case 'edit':
            return t('toolGroup.editedFile');
        case 'read':
            return t('tools.names.readFile');
        case 'search':
            return t('tools.names.search');
        case 'web':
            return t('tools.names.fetchUrl');
        case 'task':
            return t('tools.names.task');
        default:
            return toolName;
    }
}

function isFileEditTool(toolName: string): boolean {
    return toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write';
}

const styles = StyleSheet.create((theme) => ({
    outerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    innerContainer: {
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        maxWidth: layout.maxWidth,
        marginVertical: 6,
        marginHorizontal: 8,
        overflow: 'hidden',
        borderRadius: 12,
    },
    nestedOuterContainer: {
        overflow: 'hidden',
    },
    nestedInnerContainer: {
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'stretch',
        marginHorizontal: 16,
        marginTop: 4,
        minHeight: 44,
        paddingVertical: 8,
        borderRadius: 4,
    },
    headerPressed: {
        opacity: 0.6,
    },
    headerIcon: {
        width: 14,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    summaryText: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 13,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    content: {
        marginTop: 2,
        gap: 2,
        paddingBottom: 6,
    },
    toolSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 24,
        marginHorizontal: 16,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden',
    },
    toolSummaryRowPressed: {
        opacity: 0.65,
    },
    toolSummaryIcon: {
        width: 14,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    toolSummaryTitle: {
        flexShrink: 0,
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
    },
    toolSummaryDetailPill: {
        flexShrink: 1,
        minWidth: 0,
        maxWidth: '100%',
        borderRadius: 3,
        paddingHorizontal: 4,
        paddingVertical: 1,
        backgroundColor: theme.colors.surfaceHighest,
    },
    toolSummaryDetailText: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.colors.textSecondary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    toolSummaryStateChip: {
        height: 22,
        paddingHorizontal: 7,
    },
}));
