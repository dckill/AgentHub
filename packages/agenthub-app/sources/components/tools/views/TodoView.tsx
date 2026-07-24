import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ToolViewProps } from "./_all";
import { knownTools } from '../../tools/knownTools';
import { ToolSectionView } from '../../tools/ToolSectionView';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useChatScale } from '@/hooks/useScale';

export interface Todo {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'high' | 'medium' | 'low';
    id?: string;
}

export const TodoView = React.memo<ToolViewProps>(({ tool }) => {
    const { theme } = useUnistyles();
    const { s } = useChatScale();
    let todosList: Todo[] = [];
    
    // Try to get todos from input first
    let parsedArguments = knownTools.TodoWrite.input.safeParse(tool.input);
    if (parsedArguments.success && parsedArguments.data.todos) {
        todosList = parsedArguments.data.todos;
    }
    
    // If we have a properly structured result, use newTodos from there
    let parsed = knownTools.TodoWrite.result.safeParse(tool.result);
    if (parsed.success && parsed.data.newTodos) {
        todosList = parsed.data.newTodos;
    }
    
    // If we have todos to display, show them
    if (todosList.length > 0) {
        const totalCount = todosList.length;
        const completedCount = todosList.filter((todo) => todo.status === 'completed').length;
        const inProgressCount = todosList.filter((todo) => todo.status === 'in_progress').length;
        const pendingCount = todosList.filter((todo) => todo.status === 'pending').length;
        const percent = Math.round((completedCount / totalCount) * 100);

        return (
            <ToolSectionView>
                <View style={[styles.container, { gap: s(10) }]}>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryTextWrap}>
                            <Text style={[styles.summaryTitle, { color: theme.colors.text, fontSize: s(14) }]}>
                                {t('tools.todo.progressLabel', { completed: completedCount, total: totalCount, percent })}
                            </Text>
                            <Text style={[styles.summaryMeta, { color: theme.colors.textSecondary, fontSize: s(12) }]}>
                                {t('tools.todo.statusInProgress')} {inProgressCount} · {t('tools.todo.statusPending')} {pendingCount}
                            </Text>
                        </View>
                        <View style={[styles.percentBadge, { backgroundColor: theme.colors.success + '1F', borderColor: theme.colors.success + '55' }]}>
                            <Text style={[styles.percentText, { color: theme.colors.success, fontSize: s(12) }]}>
                                {percent}%
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceHigh, height: s(6), borderRadius: s(3) }]}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${percent}%`,
                                    backgroundColor: theme.colors.success,
                                    borderRadius: s(3),
                                },
                            ]}
                        />
                    </View>

                    {todosList.map((todo, index) => {
                        const isCompleted = todo.status === 'completed';
                        const isInProgress = todo.status === 'in_progress';
                        const statusColor = isCompleted
                            ? theme.colors.success
                            : isInProgress
                                ? theme.colors.textLink
                                : theme.colors.textSecondary;
                        const statusLabel = isCompleted
                            ? t('tools.todo.statusCompleted')
                            : isInProgress
                                ? t('tools.todo.statusInProgress')
                                : t('tools.todo.statusPending');
                        const statusIcon = isCompleted
                            ? 'checkmark-circle'
                            : isInProgress
                                ? 'play-circle'
                                : 'ellipse-outline';

                        return (
                            <View
                                key={todo.id || `todo-${index}`}
                                style={[
                                    styles.todoItem,
                                    {
                                        backgroundColor: theme.colors.surfaceHigh,
                                        borderColor: theme.colors.divider,
                                        borderRadius: s(10),
                                        paddingHorizontal: s(10),
                                        paddingVertical: s(8),
                                        gap: s(8),
                                    },
                                ]}
                            >
                                <Ionicons name={statusIcon} size={s(17)} color={statusColor} style={styles.todoIcon} />
                                <View style={styles.todoBody}>
                                    <View style={[styles.todoMetaRow, { gap: s(6), marginBottom: s(3) }]}>
                                        <View style={[styles.statusPill, { borderColor: statusColor + '66', backgroundColor: statusColor + '17', paddingHorizontal: s(7), paddingVertical: s(2), borderRadius: s(999) }]}>
                                            <Text style={[styles.statusText, { color: statusColor, fontSize: s(11) }]}>
                                                {statusLabel}
                                            </Text>
                                        </View>
                                        {todo.priority && (
                                            <Text style={[styles.priorityText, { color: theme.colors.textSecondary, fontSize: s(11) }]}>
                                                {getPriorityLabel(todo.priority)}
                                            </Text>
                                        )}
                                    </View>
                                    <Text
                                        style={[
                                            styles.todoText,
                                            { color: isCompleted ? theme.colors.textSecondary : theme.colors.text, fontSize: s(14), lineHeight: s(19) },
                                            isCompleted && styles.completedText,
                                        ]}
                                    >
                                        {todo.content}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ToolSectionView>
        )
    }

    return null;
});

function getPriorityLabel(priority: Todo['priority']): string {
    if (priority === 'high') return t('tools.todo.priorityHigh');
    if (priority === 'medium') return t('tools.todo.priorityMedium');
    if (priority === 'low') return t('tools.todo.priorityLow');
    return '';
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 2,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    summaryTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    summaryTitle: {
        fontWeight: '700',
    },
    summaryMeta: {
        marginTop: 2,
        fontWeight: '500',
    },
    percentBadge: {
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
    },
    percentText: {
        fontWeight: '800',
    },
    progressTrack: {
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
    },
    todoItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: StyleSheet.hairlineWidth,
    },
    todoIcon: {
        marginTop: 2,
    },
    todoBody: {
        flex: 1,
        minWidth: 0,
    },
    todoMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    statusPill: {
        borderWidth: StyleSheet.hairlineWidth,
    },
    statusText: {
        fontWeight: '700',
    },
    priorityText: {
        fontWeight: '600',
    },
    todoText: {
        flex: 1,
    },
    completedText: {
        textDecorationLine: 'line-through',
    },
});
