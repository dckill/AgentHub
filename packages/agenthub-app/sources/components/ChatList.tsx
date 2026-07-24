import * as React from 'react';
import { useSession, useSessionMessages, useSetting } from "@/sync/storage";
import { ActivityIndicator, FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, View } from 'react-native';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';
import { AgentWorkGroupView, ToolGroupView } from './ToolGroupView';
import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';
import { DisplayItem, useGroupedMessages } from '@/hooks/useGroupedMessages';
import Octicons from '@expo/vector-icons/Octicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { getInteractiveOptionsMessageId } from '@/utils/chatOptions';
import { sync } from '@/sync/sync';
import { HistoryPaginationGate } from './historyPaginationGate';
import { resolveCollapsedGroupIds, type GroupCollapseOverrides } from './groupCollapseState';

const SCROLL_THRESHOLD = 300;

export const ChatList = React.memo((props: { session: Session }) => {
    const { messages, hasMoreBefore, isLoadingBefore } = useSessionMessages(props.session.id);
    return (
        <ChatListInternal
            metadata={props.session.metadata}
            sessionId={props.session.id}
            messages={messages}
            hasMoreBefore={hasMoreBefore}
            isLoadingBefore={isLoadingBefore}
        />
    )
});

const ListHeader = React.memo(() => {
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    return <View style={{ flexDirection: 'row', alignItems: 'center', height: headerHeight + safeArea.top + 32 }} />;
});

const OlderMessagesFooter = React.memo((props: { isLoading: boolean }) => {
    const { theme } = useUnistyles();
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    return (
        <View style={{ minHeight: headerHeight + safeArea.top + 32, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 12 }}>
            {props.isLoading ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : null}
        </View>
    );
});

const ListFooter = React.memo((props: { sessionId: string }) => {
    const session = useSession(props.sessionId)!;
    return (
        <ChatFooter controlledByUser={session.agentState?.controlledByUser || false} />
    )
});

const ChatListInternal = React.memo((props: {
    metadata: Metadata | null,
    sessionId: string,
    messages: Message[],
    hasMoreBefore: boolean,
    isLoadingBefore: boolean,
}) => {
    const { theme } = useUnistyles();
    const flatListRef = React.useRef<FlatList>(null);
    const historyPaginationGate = React.useRef(new HistoryPaginationGate()).current;
    const isLoadingBeforeRef = React.useRef(props.isLoadingBefore);
    isLoadingBeforeRef.current = props.isLoadingBefore;
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const isNearBottom = React.useRef(true);
    const interactiveOptionsMessageId = React.useMemo(
        () => getInteractiveOptionsMessageId(props.messages),
        [props.messages],
    );
    const session = useSession(props.sessionId);
    const collapseAgentWork = useSetting('collapseAgentWork');
    const hasPendingPermission = Boolean(
        session?.agentState?.requests && Object.keys(session.agentState.requests).length > 0,
    );
    const hasPendingUserAction = interactiveOptionsMessageId !== null || props.messages.some((message) => (
        message.kind === 'tool-call'
        && message.tool.name === 'AskUserQuestion'
        && message.tool.state === 'running'
    ));
    const currentTurnBoundary = props.messages.findIndex((message) => message.kind === 'user-text');
    const currentTurnMessages = currentTurnBoundary >= 0
        ? props.messages.slice(0, currentTurnBoundary)
        : props.messages;
    const hasFinalAgentReply = currentTurnMessages.some((message) => (
        message.kind === 'agent-event'
        && message.event.type === 'ready'
        && message.meta?.turnStatus === 'completed'
        && typeof message.meta.finalTextId === 'string'
    ));
    const collapseCurrentTurn = session?.thinking !== true
        && hasFinalAgentReply
        && !hasPendingPermission
        && !hasPendingUserAction;
    const groupingOptions = React.useMemo(
        () => ({ collapseCurrentTurn }),
        [collapseCurrentTurn],
    );
    const displayItems = useGroupedMessages(props.messages, collapseAgentWork, groupingOptions);
    const [collapseOverrides, setCollapseOverrides] = React.useState<GroupCollapseOverrides | null>(null);
    const collapsedGroups = React.useMemo(
        () => resolveCollapsedGroupIds(displayItems, collapseOverrides, props.sessionId),
        [collapseOverrides, displayItems, props.sessionId],
    );

    React.useEffect(() => {
        historyPaginationGate.reset();
    }, [historyPaginationGate, props.sessionId]);

    const handleToggleGroup = useCallback((groupId: string) => {
        setCollapseOverrides((prev) => {
            const values = prev?.sessionId === props.sessionId
                ? new Map(prev.values)
                : new Map<string, boolean>();
            values.set(groupId, !collapsedGroups.has(groupId));
            return { sessionId: props.sessionId, values };
        });
    }, [collapsedGroups, props.sessionId]);

    const keyExtractor = useCallback((item: DisplayItem) => item.id, []);
    const renderItem = useCallback(({ item }: { item: DisplayItem }) => {
        if (item.type === 'tool-group') {
            return (
                <ToolGroupView
                    group={item}
                    metadata={props.metadata}
                    sessionId={props.sessionId}
                    expanded={!collapsedGroups.has(item.id)}
                    onToggle={() => handleToggleGroup(item.id)}
                />
            );
        }
        if (item.type === 'agent-work-group') {
            return (
                <AgentWorkGroupView
                    group={item}
                    metadata={props.metadata}
                    sessionId={props.sessionId}
                    expanded={!collapsedGroups.has(item.id)}
                    onToggle={() => handleToggleGroup(item.id)}
                />
            );
        }
        return (
            <MessageView
                message={item.message}
                metadata={props.metadata}
                sessionId={props.sessionId}
                interactiveOptionsMessageId={interactiveOptionsMessageId}
            />
        );
    }, [collapsedGroups, handleToggleGroup, interactiveOptionsMessageId, props.metadata, props.sessionId]);

    // In inverted FlatList, offset 0 = latest messages (visual bottom).
    // Offset increases as user scrolls up to see older messages.
    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        setShowScrollButton(offsetY > SCROLL_THRESHOLD);
        // Track near-bottom state for auto-scroll on new content
        isNearBottom.current = offsetY < 100;
    }, []);

    const onContentSizeChange = useCallback(() => {
        if (isNearBottom.current) {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
    }, []);

    const scrollToBottom = useCallback(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, []);

    const handleEndReached = useCallback(() => {
        if (historyPaginationGate.tryStart({
            hasMore: props.hasMoreBefore,
            isLoading: props.isLoadingBefore,
        })) {
            sync.loadOlderMessages(props.sessionId);
        }
    }, [historyPaginationGate, props.hasMoreBefore, props.isLoadingBefore, props.sessionId]);

    const handleUserScrollGesture = useCallback(() => {
        historyPaginationGate.onUserGesture({ isLoading: isLoadingBeforeRef.current });
    }, [historyPaginationGate]);

    // On macOS/web, Shift+wheel swaps deltaX/deltaY — restore vertical scrolling
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        const node = (flatListRef.current as any)?.getScrollableNode?.() as HTMLElement | undefined;
        if (!node) return;
        const handler = (e: WheelEvent) => {
            handleUserScrollGesture();
            if (e.shiftKey && Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) < 1) {
                node.scrollTop += e.deltaX;
                e.preventDefault();
            }
        };
        const pointerHandler = () => handleUserScrollGesture();
        const keyHandler = () => handleUserScrollGesture();
        node.addEventListener('wheel', handler, { passive: false });
        node.addEventListener('pointerdown', pointerHandler, { passive: true });
        node.addEventListener('keydown', keyHandler);
        return () => {
            node.removeEventListener('wheel', handler);
            node.removeEventListener('pointerdown', pointerHandler);
            node.removeEventListener('keydown', keyHandler);
        };
    }, [handleUserScrollGesture]);

    return (
        <View style={{ flex: 1 }}>
            <FlatList
                ref={flatListRef}
                data={displayItems}
                inverted={true}
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={{
                    minIndexForVisible: 0,
                    autoscrollToTopThreshold: 10,
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                renderItem={renderItem}
                onScroll={handleScroll}
                onScrollBeginDrag={handleUserScrollGesture}
                onMomentumScrollBegin={handleUserScrollGesture}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.35}
                onContentSizeChange={onContentSizeChange}
                scrollEventThrottle={16}
                ListHeaderComponent={<ListFooter sessionId={props.sessionId} />}
                ListFooterComponent={props.hasMoreBefore || props.isLoadingBefore ? <OlderMessagesFooter isLoading={props.isLoadingBefore} /> : <ListHeader />}
            />
            {showScrollButton && (
                <View style={styles.scrollButtonContainer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.scrollButton,
                            pressed ? styles.scrollButtonPressed : styles.scrollButtonDefault
                        ]}
                        onPress={scrollToBottom}
                    >
                        <Octicons name="arrow-down" size={14} color={theme.colors.text} />
                    </Pressable>
                </View>
            )}
        </View>
    )
});

const styles = StyleSheet.create((theme) => ({
    scrollButtonContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'box-none',
    },
    scrollButton: {
        borderRadius: 16,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        shadowOpacity: theme.colors.shadow.opacity * 0.5,
        elevation: 2,
    },
    scrollButtonDefault: {
        backgroundColor: theme.colors.surface,
        opacity: 0.9,
    },
    scrollButtonPressed: {
        backgroundColor: theme.colors.surface,
        opacity: 0.7,
    },
}));
