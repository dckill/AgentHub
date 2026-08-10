import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { Modal } from '@/modal';
import { t } from '@/text';
import { useSession } from '@/sync/storage';
import {
    claudeListRewindPoints,
    codexListRewindPoints,
    forkAndSpawn,
} from '@/sync/ops';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';
import { getSessionForkSource } from '@/utils/sessionFork';

export type DuplicateSheetProps = {
    sessionId: string;
    initialRewindPointId?: string;
    initialMessageText?: string;
    initialForkedFromMessageId?: string;
    onClose?: () => void;
};

type RewindPoint = { id: string; text: string; timestamp: number };

export function showDuplicateSheet(props: Omit<DuplicateSheetProps, 'onClose'>): void {
    Modal.show({
        component: DuplicateSheet,
        props,
        accessibilityLabel: t('session.duplicateSheetTitle'),
    });
}

export const DuplicateSheet = React.memo(function DuplicateSheet({
    sessionId,
    initialRewindPointId,
    initialMessageText,
    initialForkedFromMessageId,
    onClose,
}: DuplicateSheetProps) {
    const session = useSession(sessionId);
    const router = useRouter();
    const { theme } = useUnistyles();
    const source = React.useMemo(() => session ? getSessionForkSource(session) : null, [session]);
    const [points, setPoints] = React.useState<RewindPoint[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedId, setSelectedId] = React.useState(initialRewindPointId ?? null);
    const [loadVersion, setLoadVersion] = React.useState(0);
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => !cancelled && generation !== null && sync.getAccountGeneration() === generation;
        setPoints(null);
        setError(null);
        void (async () => {
            if (!source) {
                if (isCurrent()) {
                    setPoints([]);
                    setError(t('session.forkErrorMissingMetadata'));
                }
                return;
            }
            const result = source.kind === 'codex'
                ? await codexListRewindPoints({
                    machineId: source.machineId,
                    directory: source.directory,
                    codexThreadId: source.codexThreadId,
                })
                : await claudeListRewindPoints({
                    machineId: source.machineId,
                    directory: source.directory,
                    claudeSessionId: source.claudeSessionId,
                });
            if (!isCurrent()) return;
            if (result.type === 'success') {
                const normalized = result.points.map((point) => ({
                    id: 'itemId' in point ? point.itemId : point.uuid,
                    text: point.text,
                    timestamp: point.timestamp,
                })).reverse();
                setPoints(normalized);
                setError(null);
            } else {
                setPoints([]);
                setError(result.errorMessage);
            }
        })().catch((reason) => {
            if (isCurrent()) {
                setPoints([]);
                setError(reason instanceof Error ? reason.message : t('session.forkErrorGeneric'));
            }
        });
        return () => { cancelled = true; };
    }, [loadVersion, source]);

    React.useEffect(() => {
        if (!points || selectedId || !initialMessageText) return;
        const target = normalizeText(initialMessageText);
        const match = points.find((point) => normalizeText(point.text) === target);
        if (match) setSelectedId(match.id);
    }, [initialMessageText, points, selectedId]);

    React.useEffect(() => {
        if (points && selectedId && !points.some((point) => point.id === selectedId)) {
            setSelectedId(null);
        }
    }, [points, selectedId]);

    const selected = points?.find((point) => point.id === selectedId) ?? null;
    const submit = React.useCallback(() => {
        if (!source || !selected || submitting) return;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        setSubmitting(true);
        void (async () => {
            const preservesInitialLineage = selected.id === initialRewindPointId
                || (!initialRewindPointId && initialMessageText
                    && normalizeText(selected.text) === normalizeText(initialMessageText));
            const result = await runSessionActionRequest({
                isCurrent,
                request: async () => source.kind === 'codex'
                    ? await forkAndSpawn(source, {
                        cutAfterItemId: selected.id,
                        forkedFromMessageId: preservesInitialLineage ? initialForkedFromMessageId : undefined,
                    })
                    : await forkAndSpawn(source, {
                        cutAfterUuid: selected.id,
                        forkedFromMessageId: preservesInitialLineage ? initialForkedFromMessageId : undefined,
                    }),
            });
            if (result === null) return;
            if (result.type === 'success') {
                if (!isCurrent()) return;
                onClose?.();
                router.replace(`/session/${result.sessionId}`);
                return;
            }
            const message = result.type === 'error' ? result.errorMessage : t('session.forkErrorGeneric');
            Modal.alert(t('common.error'), message);
        })().catch((reason) => {
            if (!isCurrent()) return;
            Modal.alert(t('common.error'), reason instanceof Error ? reason.message : t('session.forkErrorGeneric'));
        }).finally(() => setSubmitting(false));
    }, [initialForkedFromMessageId, initialMessageText, initialRewindPointId, onClose, router, selected, source, submitting]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text accessibilityRole="header" style={styles.title}>{t('session.duplicateSheetTitle')}</Text>
                <Text style={styles.subtitle}>{t('session.duplicateSheetSubtitle')}</Text>
            </View>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {points === null ? (
                    <View accessibilityLabel={t('common.loading')} style={styles.state}>
                        <ActivityIndicator color={theme.colors.textSecondary} />
                    </View>
                ) : error ? (
                    <View style={styles.state}>
                        <Text style={styles.stateText}>{error}</Text>
                        <Pressable accessibilityRole="button" onPress={() => setLoadVersion((value) => value + 1)} style={styles.retryButton}>
                            <Text style={styles.retryText}>{t('common.retry')}</Text>
                        </Pressable>
                    </View>
                ) : points.length === 0 ? (
                    <View style={styles.state}><Text style={styles.stateText}>{t('session.duplicateSheetEmpty')}</Text></View>
                ) : points.map((point) => {
                    const selected = point.id === selectedId;
                    return (
                        <Pressable
                            key={point.id}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            onPress={() => setSelectedId(point.id)}
                            style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
                        >
                            <Text numberOfLines={3} style={styles.rowText}>{compactPreview(point.text)}</Text>
                            <Text style={styles.rowMeta}>{new Date(point.timestamp).toLocaleString()}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
            <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.pressed]}>
                    <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !selected || submitting }}
                    disabled={!selected || submitting}
                    onPress={submit}
                    style={({ pressed }) => [styles.button, styles.primaryButton, (!selected || submitting) && styles.disabled, pressed && styles.pressed]}
                >
                    {submitting ? <ActivityIndicator color={theme.colors.button.primary.tint} /> : (
                        <Text style={styles.primaryText}>{t('session.duplicateSheetConfirm')}</Text>
                    )}
                </Pressable>
            </View>
        </View>
    );
});

function normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

function compactPreview(text: string): string {
    const compact = normalizeText(text);
    return compact.length > 160 ? `${compact.slice(0, 160)}…` : compact;
}

const styles = StyleSheet.create((theme) => ({
    container: { minHeight: 300, maxHeight: 620 },
    header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider },
    title: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
    subtitle: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 5 },
    list: { flexGrow: 0, flexShrink: 1, minHeight: 180, maxHeight: 430 },
    listContent: { paddingVertical: 6 },
    state: { minHeight: 180, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 },
    stateText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    retryButton: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10, backgroundColor: theme.colors.surfaceHigh },
    retryText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
    row: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider },
    rowSelected: { backgroundColor: theme.colors.surfaceHigh, borderLeftWidth: 3, borderLeftColor: theme.colors.button.primary.background },
    rowPressed: { opacity: 0.76 },
    rowText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
    rowMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 5 },
    actions: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
    button: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    primaryButton: { backgroundColor: theme.colors.button.primary.background },
    secondaryButton: { backgroundColor: theme.colors.surfaceHigh },
    primaryText: { color: theme.colors.button.primary.tint, fontSize: 15, fontWeight: '700' },
    secondaryText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.72 },
}));
