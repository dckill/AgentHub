import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import { useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { DirectoryTreePanel } from './DirectoryTreePanel';
import { FilesSidebar } from './FilesSidebar';
import { SideChatPanel } from './SideChatPanel';
import { useDirectoryTree } from '@/hooks/useDirectoryTree';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { encodeSessionFileRoutePath } from '@/utils/sessionFileLinks';
import { getSessionForkSource } from '@/utils/sessionFork';
import { AgentHubError } from '@/utils/errors';
import { sessionArchive, sessionKill, spawnSideChat } from '@/sync/ops';
import { storage, useLocalSetting, useSideChatSessions } from '@/sync/storage';
import { sync } from '@/sync/sync';
import type { Session } from '@/sync/storageTypes';
import type { GitFileStatus } from '@/sync/gitStatusFiles';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { formatShortcutChord, getPreferredShortcutModifier, matchesShortcutChord, SIDEBAR_PICKER_SHORTCUTS, type SidebarPickerShortcutId } from '@/keyboard/shortcuts';
import { runSideChatCloseLifecycle } from '@/sync/sideChatCloseLifecycle';
import { closeSideChatSession } from '@/sync/sideChatSessionClose';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';

export type SidebarMode = 'changes' | 'allFiles' | 'sideChat';
const PANEL_DEFS: Array<{ id: Exclude<SidebarMode, 'sideChat'>; icon: keyof typeof Octicons.glyphMap; label: () => string }> = [
    { id: 'changes', icon: 'git-compare', label: () => t('files.changes') },
    { id: 'allFiles', icon: 'file-directory', label: () => t('sideChat.allFiles') },
];

function AllFilesPanel(props: { session: Session }) {
    const router = useRouter();
    const tree = useDirectoryTree(props.session.id, props.session.metadata?.path);
    return (
        <DirectoryTreePanel
            tree={tree.tree}
            isLoading={tree.isLoading}
            error={tree.error}
            expanded={tree.expanded}
            loadingPaths={tree.loadingPaths}
            onToggle={tree.toggleNode}
            onRetry={tree.refresh}
            onFileSelect={(path) => router.push(`/session/${props.session.id}/file?path=${encodeSessionFileRoutePath(path)}`)}
        />
    );
}

export function SessionWorkbenchSidebar(props: {
    session: Session;
    selectedPath?: string | null;
    onFilePress?: (file: GitFileStatus) => void;
    renderSideChat: (session: Session) => React.ReactNode;
}) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const openPanels = useLocalSetting('sidebarPanelsOpen') as SidebarMode[];
    const activeRaw = useLocalSetting('sidebarPanelActive') as SidebarMode | null;
    const activePanel = activeRaw && openPanels.includes(activeRaw) ? activeRaw : openPanels[openPanels.length - 1] ?? null;
    const rawSideChats = useSideChatSessions(props.session.id);
    const [closedIds, setClosedIds] = React.useState<Set<string>>(() => new Set());
    const sideChats = React.useMemo(() => rawSideChats.filter((session) => !closedIds.has(session.id)), [closedIds, rawSideChats]);
    const [activeSideChatId, setActiveSideChatId] = React.useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const forkSource = React.useMemo(() => getSessionForkSource(props.session), [props.session]);
    const preferredModifier = React.useMemo(() => getPreferredShortcutModifier(typeof navigator === 'undefined' ? undefined : navigator), []);

    const applyPanels = React.useCallback((panels: SidebarMode[], active: SidebarMode | null) => {
        storage.getState().applyLocalSettings({ sidebarPanelsOpen: panels, sidebarPanelActive: active });
    }, []);
    const openPanel = React.useCallback((panel: SidebarMode) => {
        const current = storage.getState().localSettings.sidebarPanelsOpen as SidebarMode[];
        applyPanels(current.includes(panel) ? current : [...current, panel], panel);
        setPickerOpen(false);
    }, [applyPanels]);
    const closePanel = React.useCallback((panel: SidebarMode) => {
        const current = storage.getState().localSettings.sidebarPanelsOpen as SidebarMode[];
        const next = current.filter((item) => item !== panel);
        applyPanels(next, next[next.length - 1] ?? null);
    }, [applyPanels]);

    React.useEffect(() => {
        if (sideChats.length === 0) setActiveSideChatId(null);
        else if (!activeSideChatId || !sideChats.some((session) => session.id === activeSideChatId)) setActiveSideChatId(sideChats[sideChats.length - 1].id);
    }, [activeSideChatId, sideChats]);
    React.useEffect(() => {
        setClosedIds((current) => {
            const visibleIds = new Set(rawSideChats.map((session) => session.id));
            const next = new Set([...current].filter((id) => visibleIds.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [rawSideChats]);

    const [creating, createSideChat] = useAgentHubAction(async () => {
        if (!forkSource) throw new AgentHubError(t('sideChat.unavailable'), false);
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const result = await runSessionActionRequest({
            isCurrent,
            request: async () => await spawnSideChat(forkSource),
        });
        if (result === null) return;
        if (result.type !== 'success') throw new AgentHubError(result.type === 'error' ? result.errorMessage : t('session.forkErrorGeneric'), false);
        if (!isCurrent()) return;
        if (props.session.permissionMode) storage.getState().updateSessionPermissionMode(result.sessionId, props.session.permissionMode);
        if (props.session.modelMode) storage.getState().updateSessionModelMode(result.sessionId, props.session.modelMode);
        if (!isCurrent()) return;
        setActiveSideChatId(result.sessionId);
        openPanel('sideChat');
    });

    const closeSideChat = React.useCallback((id: string) => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        const remaining = sideChats.filter((session) => session.id !== id);
        setClosedIds((current) => new Set(current).add(id));
        setActiveSideChatId(remaining[0]?.id ?? null);
        if (remaining.length === 0) closePanel('sideChat');
        void runSideChatCloseLifecycle({
            ids: [id],
            isCurrent,
            closeSession: (sessionId, isCurrent) => closeSideChatSession(sessionId, isCurrent, sessionKill, sessionArchive),
            refreshSessions: () => sync.refreshSessions().catch(() => {}),
        }).catch(() => {});
    }, [closePanel, sideChats]);

    const closeAllSideChats = React.useCallback(() => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        const ids = sideChats.map((session) => session.id);
        setClosedIds((current) => new Set([...current, ...ids]));
        setActiveSideChatId(null);
        closePanel('sideChat');
        void runSideChatCloseLifecycle({
            ids,
            isCurrent,
            closeSession: (sessionId, isCurrent) => closeSideChatSession(sessionId, isCurrent, sessionKill, sessionArchive),
            refreshSessions: () => sync.refreshSessions().catch(() => {}),
        }).catch(() => {});
    }, [closePanel, sideChats]);

    const handleClosePanel = React.useCallback((panel: SidebarMode) => {
        if (panel === 'sideChat') closeAllSideChats();
        else closePanel(panel);
    }, [closeAllSideChats, closePanel]);

    const available = PANEL_DEFS.filter((panel) => !openPanels.includes(panel.id));
    const runPickerShortcut = React.useCallback((id: SidebarPickerShortcutId) => {
        if (id === 'newSideChat') {
            if (!forkSource || creating) return false;
            createSideChat();
            return true;
        }
        if (!available.some((panel) => panel.id === id)) return false;
        openPanel(id);
        return true;
    }, [available, createSideChat, creating, forkSource, openPanel]);
    React.useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || (!pickerOpen && activePanel !== null)) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const id = (Object.keys(SIDEBAR_PICKER_SHORTCUTS) as SidebarPickerShortcutId[]).find((candidate) => matchesShortcutChord(event, preferredModifier, SIDEBAR_PICKER_SHORTCUTS[candidate]));
            if (!id || !runPickerShortcut(id)) return;
            event.preventDefault();
            event.stopPropagation();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [activePanel, pickerOpen, preferredModifier, runPickerShortcut]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.chips}>
                    {openPanels.map((panel) => (
                        <Pressable key={panel} accessibilityRole="tab" accessibilityState={{ selected: panel === activePanel }} onPress={() => applyPanels(openPanels, panel)} style={[styles.chip, panel === activePanel && styles.chipActive]}>
                            <Text style={styles.chipText}>{panel === 'changes' ? t('files.changes') : panel === 'allFiles' ? t('sideChat.allFiles') : t('sideChat.panelTitle')}</Text>
                            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={6} onPress={(event) => { event.stopPropagation?.(); handleClosePanel(panel); }}><Octicons name="x" size={12} color={theme.colors.textSecondary} /></Pressable>
                        </Pressable>
                    ))}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={t('files.addPanel')} onPress={() => setPickerOpen((value) => !value)} style={styles.iconButton}><Octicons name="plus" size={15} color={theme.colors.textSecondary} /></Pressable>
            </View>
            {(pickerOpen || activePanel === null) ? (
                <View style={styles.picker}>
                    {available.map((panel) => <PickerRow key={panel.id} label={panel.label()} icon={panel.icon} shortcut={formatShortcutChord(preferredModifier, SIDEBAR_PICKER_SHORTCUTS[panel.id])} onPress={() => openPanel(panel.id)} />)}
                    <PickerRow label={t('sideChat.newChat')} icon="comment-discussion" shortcut={formatShortcutChord(preferredModifier, SIDEBAR_PICKER_SHORTCUTS.newSideChat)} loading={creating} disabled={!forkSource || creating} onPress={createSideChat} />
                </View>
            ) : activePanel === 'changes' ? (
                <FilesSidebar sessionId={props.session.id} selectedPath={props.selectedPath} onFilePress={props.onFilePress} />
            ) : activePanel === 'allFiles' ? (
                <AllFilesPanel session={props.session} />
            ) : (
                <SideChatPanel sessions={sideChats} activeId={activeSideChatId} creating={creating} canCreate={!!forkSource} onCreate={createSideChat} onSelect={setActiveSideChatId} onClose={closeSideChat} onExpand={(id) => router.push(`/session/${id}`)} renderSession={props.renderSideChat} />
            )}
        </View>
    );
}

function PickerRow(props: { label: string; icon: keyof typeof Octicons.glyphMap; shortcut: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
    const { theme } = useUnistyles();
    return <Pressable accessibilityRole="button" accessibilityLabel={`${props.label}, ${props.shortcut}`} disabled={props.disabled} onPress={props.onPress} style={({ pressed }) => [styles.pickerRow, props.disabled && styles.disabled, pressed && styles.pressed]}>{props.loading ? <ActivityIndicator size="small" /> : <Octicons name={props.icon} size={15} color={theme.colors.textSecondary} />}<Text style={styles.pickerLabel}>{props.label}</Text><Text style={styles.shortcut}>{props.shortcut}</Text></Pressable>;
}

const styles = StyleSheet.create((theme) => ({
    container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.groupped.background },
    header: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.divider },
    chips: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
    chip: { minHeight: 32, maxWidth: 126, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 8 },
    chipActive: { backgroundColor: theme.colors.surfaceSelected },
    chipText: { flexShrink: 1, color: theme.colors.text, fontSize: 12, ...Typography.default('semiBold') },
    iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    picker: { flex: 1, alignItems: 'stretch', justifyContent: 'center', gap: 8, padding: 20 },
    pickerRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 10, backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.divider },
    pickerLabel: { flex: 1, color: theme.colors.text, fontSize: 13, ...Typography.default('semiBold') },
    shortcut: { color: theme.colors.textSecondary, fontSize: 11, ...Typography.mono() },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.82 },
}));
