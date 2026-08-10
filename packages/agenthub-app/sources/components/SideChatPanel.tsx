import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import type { Session } from '@/sync/storageTypes';

export function SideChatPanel(props: {
    sessions: Session[];
    activeId: string | null;
    creating: boolean;
    canCreate: boolean;
    onCreate: () => void;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onExpand: (id: string) => void;
    renderSession: (session: Session) => React.ReactNode;
}) {
    const { theme } = useUnistyles();
    const active = props.sessions.find((session) => session.id === props.activeId) ?? props.sessions[0] ?? null;

    if (!active) {
        return (
            <View role="status" accessibilityLiveRegion="polite" style={styles.empty}>
                <View style={styles.emptyIcon}><Octicons name="comment-discussion" size={26} color={theme.colors.textSecondary} /></View>
                <Text accessibilityRole="header" style={styles.emptyTitle}>{t('sideChat.emptyTitle')}</Text>
                <Text style={styles.emptySubtitle}>{t('sideChat.emptySubtitle')}</Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('sideChat.startButton')}
                    disabled={props.creating || !props.canCreate}
                    onPress={props.onCreate}
                    style={({ pressed }) => [styles.primaryButton, (props.creating || !props.canCreate) && styles.disabled, pressed && styles.pressed]}
                >
                    {props.creating ? <ActivityIndicator size="small" color={theme.colors.button.primary.tint} /> : <Octicons name="plus" size={14} color={theme.colors.button.primary.tint} />}
                    <Text style={styles.primaryButtonText}>{props.creating ? t('sideChat.creating') : t('sideChat.startButton')}</Text>
                </Pressable>
                {!props.canCreate ? <Text style={styles.hint}>{t('sideChat.unavailable')}</Text> : null}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.toolbar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                    {props.sessions.map((session, index) => (
                        <Pressable
                            key={session.id}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: session.id === active.id }}
                            onPress={() => props.onSelect(session.id)}
                            style={[styles.tab, session.id === active.id && styles.tabActive]}
                        >
                            <Text numberOfLines={1} style={[styles.tabText, session.id === active.id && styles.tabTextActive]}>
                                {session.metadata?.name || t('sideChat.defaultTitle', { index: index + 1 })}
                            </Text>
                            <Pressable accessibilityRole="button" accessibilityLabel={t('sideChat.close')} hitSlop={6} onPress={(event) => { event.stopPropagation?.(); props.onClose(session.id); }}>
                                <Octicons name="x" size={12} color={theme.colors.textSecondary} />
                            </Pressable>
                        </Pressable>
                    ))}
                </ScrollView>
                <Pressable accessibilityRole="button" accessibilityLabel={t('sideChat.newChat')} disabled={props.creating || !props.canCreate} onPress={props.onCreate} style={styles.iconButton}>
                    {props.creating ? <ActivityIndicator size="small" /> : <Octicons name="plus" size={14} color={theme.colors.textSecondary} />}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('sideChat.expand')} onPress={() => props.onExpand(active.id)} style={styles.iconButton}>
                    <Octicons name="screen-full" size={13} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
            <View style={styles.body}>{props.renderSession(active)}</View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: { flex: 1 },
    toolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider },
    tabs: { alignItems: 'center', gap: 4, paddingVertical: 5 },
    tab: { maxWidth: 150, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 8 },
    tabActive: { backgroundColor: theme.colors.surfaceSelected },
    tabText: { flexShrink: 1, color: theme.colors.textSecondary, fontSize: 12, ...Typography.default() },
    tabTextActive: { color: theme.colors.text, ...Typography.default('semiBold') },
    iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    body: { flex: 1, minHeight: 0 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 7 },
    emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, marginBottom: 8 },
    emptyTitle: { color: theme.colors.text, fontSize: 15, ...Typography.default('semiBold') },
    emptySubtitle: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', ...Typography.default() },
    primaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: theme.colors.button.primary.background },
    primaryButtonText: { color: theme.colors.button.primary.tint, fontSize: 13, ...Typography.default('semiBold') },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.82 },
    hint: { color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center', ...Typography.default() },
}));
