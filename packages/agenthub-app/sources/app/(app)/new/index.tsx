import React from 'react';
import {
    View,
    Text,
    Platform,
    Pressable,
    Animated,
    TextInput,
    ScrollView,
    LayoutAnimation,
    ActivityIndicator,
    Image as RNImage,
    Keyboard,
    useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import {
    MultiTextInput,
    MULTI_TEXT_INPUT_LINE_HEIGHT,
    type KeyPressEvent,
} from '@/components/MultiTextInput';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Constants from 'expo-constants';
import { useHeaderHeight } from '@/utils/responsive';
import { t } from '@/text';
import { useAllMachines, useSessions, useSetting, storage } from '@/sync/storage';
import type { NewSessionAgentType } from '@/sync/persistence';
import { sync } from '@/sync/sync';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { isMachineOnline } from '@/utils/machineUtils';
import { machineListCodexModels, machineSpawnNewSession } from '@/sync/ops';
import { createWorktree, listWorktrees } from '@/utils/worktree';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { formatPathRelativeToHome, formatLastSeen } from '@/utils/sessionUtils';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { Modal } from '@/modal';
import { useAuth } from '@/auth/AuthContext';
import { listCredentials, getCredentialEnvVars, type ManagedCredential } from '@/sync/apiCredentials';
import { runCredentialsLoad } from '../settings/credentialsLifecycle';
import { isSupportedClientAgent, type SupportedClientAgent } from '@/sync/agentTypes';
import type { Machine, Session } from '@/sync/storageTypes';
import { buildProjectKey } from '@/utils/projectIcons';
import { restoreProjectCustomizationForExplicitSession } from '@/sync/projectVisibility';
import {
    getAvailableNewSessionAgents,
    getNextNewSessionAgentKey,
    getInitialMachineId,
    shouldClearSelectedCredential,
    shouldShowCredentialSelectorRow,
    ALL_NEW_SESSION_AGENTS,
    getNewSessionConfigItems,
    resolveModeSelection,
    resolveNewSessionAgent,
    type NewSessionConfigItem,
    type NewSessionSetupCopyKey,
} from '@/utils/newSessionState';
import {
    getHardcodedPermissionModes,
    getHardcodedModelModes,
    getCodexRuntimeModelModes,
    getEffortLevelsForModel,
    getDefaultEffortKeyForModel,
    getDefaultModelKey,
    getSupportsWorktree,
    type PermissionMode,
    type ModelMode,
    type EffortLevel,
} from '@/components/modelModeOptions';
import { isRunningOnMac } from '@/utils/platform';
import { type PickerItem, normalizePathForComparison, trimPathInput } from '@/components/PathPickerContent';
import { getAmberRaisedButtonVisuals } from '@/components/amberVisuals';
import { getAccessibleActionProps } from '@/components/accessibilityProps';
import { getComposerSendButtonHighlightGeometry } from '@/components/composerVisuals';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { useSettingsScale } from '@/hooks/useScale';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

// Agent icon assets
const agentIcons = {
    claude: require('@/assets/images/icon-claude.png'),
    codex: require('@/assets/images/icon-gpt.png'),
};

function getInitialPermissionModeKey(agent: NewSessionAgentType): string {
    return agent === 'codex' ? 'yolo' : 'bypassPermissions';
}

type AgentKey = NewSessionAgentType;
const ALL_AGENTS = ALL_NEW_SESSION_AGENTS;

type PickerType = 'machine' | 'path' | 'worktree' | 'credential';

type PermissionStyle = { color: string; icon: 'play-forward' | 'pause' };

const COMPOSER_INPUT_VERTICAL_PADDING = Platform.OS === 'web' ? 10 : 8;
const MINIMUM_TAP_TARGET = 44;
const COMPOSER_SEND_BUTTON_SIZE = MINIMUM_TAP_TARGET;
const COMPOSER_SEND_BUTTON_MARGIN_BOTTOM = Math.max(
    0,
    Math.round((MULTI_TEXT_INPUT_LINE_HEIGHT + COMPOSER_INPUT_VERTICAL_PADDING * 2 - COMPOSER_SEND_BUTTON_SIZE) / 2),
);
const WORKTREE_PATH_DEBOUNCE_MS = 300;

const NEW_SESSION_ITEM_ICONS: Record<NewSessionConfigItem['key'], keyof typeof Ionicons.glyphMap> = {
    machine: 'desktop-outline',
    path: 'folder-open-outline',
    agent: 'sparkles-outline',
    permission: 'shield-checkmark-outline',
    credential: 'key-outline',
    worktree: 'git-branch-outline',
};

function getPermissionStyle(key: string): PermissionStyle | null {
    switch (key) {
        case 'acceptEdits':
        case 'auto_edit':
            return { color: '#A78BFA', icon: 'play-forward' };
        case 'plan':
            return { color: '#5EABA4', icon: 'pause' };
        case 'dontAsk':
        case 'safe-yolo':
            return { color: '#FBBF24', icon: 'play-forward' };
        case 'bypassPermissions':
        case 'yolo':
            return { color: '#F87171', icon: 'play-forward' };
        case 'read-only':
            return { color: '#60A5FA', icon: 'pause' };
        default:
            return null;
    }
}

// Generic picker content — reused for machine and worktree selection
function PickerContent({
    title,
    fixedItems,
    items,
    selectedKey,
    onSelect,
    searchPlaceholder,
}: {
    title: string;
    fixedItems?: PickerItem[];
    items: PickerItem[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
    searchPlaceholder?: string;
}) {
    const { theme } = useUnistyles();
    const { s } = useSettingsScale();
    const [search, setSearch] = React.useState('');

    const filtered = React.useMemo(() => {
        if (!search) return items;
        const q = search.toLowerCase();
        return items.filter(item => item.label.toLowerCase().includes(q));
    }, [search, items]);

    const renderOption = (item: PickerItem) => {
        const isSelected = item.key === selectedKey;
        return (
            <Pressable
                key={item.key}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityState={{ checked: isSelected }}
                aria-checked={isSelected}
                {...getSpaceKeyActivationProps(() => onSelect(item.key))}
                style={(p) => [
                    pickerStyles.option,
                    { gap: s(12), paddingHorizontal: s(12), paddingVertical: s(12), borderRadius: s(12) },
                    p.pressed && pickerStyles.optionPressed,
                    item.dimmed && { opacity: 0.45 },
                ]}
                onPress={() => onSelect(item.key)}
            >
                <Octicons
                    name={isSelected ? 'check-circle-fill' : 'circle'}
                    size={s(16)}
                    color={isSelected ? theme.colors.button.primary.background : theme.colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                    <Text style={[pickerStyles.optionText, { color: theme.colors.text, fontSize: s(15) }]}>{item.label}</Text>
                    {item.subtitle && (
                        <Text style={[pickerStyles.optionText, { color: theme.colors.textSecondary, fontSize: s(13) }]}>{item.subtitle}</Text>
                    )}
                </View>
            </Pressable>
        );
    };

    return (
        <View style={[pickerStyles.container, { paddingHorizontal: s(16), paddingBottom: s(8) }]}>
            <Text style={[pickerStyles.title, { color: theme.colors.text, fontSize: s(18), paddingVertical: s(12), paddingHorizontal: s(4) }]}>{title}</Text>

            <View style={[
                pickerStyles.searchRow,
                {
                    backgroundColor: theme.colors.input.background,
                    gap: s(10),
                    paddingHorizontal: s(12),
                    minHeight: MINIMUM_TAP_TARGET,
                    paddingVertical: 0,
                    borderRadius: s(12),
                    marginBottom: s(8),
                },
            ]}>
                <Ionicons name="search" size={s(16)} color={theme.colors.textSecondary} />
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={searchPlaceholder ?? t('newSession.searchFallback')}
                    placeholderTextColor={theme.colors.textSecondary}
                    style={[pickerStyles.searchInput, { color: theme.colors.text, fontSize: s(15) }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            <ScrollView style={pickerStyles.optionList} keyboardShouldPersistTaps="handled">
                {fixedItems?.map(renderOption)}
                {fixedItems && fixedItems.length > 0 && filtered.length > 0 && (
                    <View style={[pickerStyles.divider, { backgroundColor: theme.colors.divider, marginHorizontal: s(12), marginVertical: s(4) }]} />
                )}
                {filtered.map(renderOption)}
                {filtered.length === 0 && search.length > 0 && (
                    <Text style={[pickerStyles.emptyText, { color: theme.colors.textSecondary, fontSize: s(14), paddingVertical: s(20) }]}>
                        {t('sessionHistory.empty')}
                    </Text>
                )}
            </ScrollView>
        </View>
    );
}

// Helper: get machine display name
function getMachineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || 'unknown';
}

function NewSessionSetupCard({
    item,
    onPress,
    children,
    compact,
}: {
    item: NewSessionConfigItem;
    onPress?: () => void;
    children?: React.ReactNode;
    compact?: boolean;
}) {
    const { theme } = useUnistyles();
    const { s } = useSettingsScale();
    const isWarning = item.tone === 'warning';
    const iconColor = isWarning ? theme.colors.status.disconnected : theme.colors.accent;
    const iconName = NEW_SESSION_ITEM_ICONS[item.key];
    const cardBackground = isWarning
        ? `${theme.colors.status.disconnected}12`
        : (theme.dark ? 'rgba(255, 255, 255, 0.052)' : theme.colors.glass.background);
    const cardBorderColor = isWarning
        ? theme.colors.status.disconnected
        : (theme.dark ? 'rgba(238, 248, 250, 0.14)' : theme.colors.glass.border);

    const card = (
        <View style={[styles.setupCardPressable, { borderRadius: s(14) }]}>
            <View
                style={[
                    styles.setupCard,
                    { gap: s(10), borderRadius: s(14), padding: s(12) },
                    { backgroundColor: cardBackground, borderColor: cardBorderColor },
                    compact && [styles.setupCardCompact, { paddingVertical: s(10), paddingHorizontal: s(11) }],
                ]}
            >
                <View style={[styles.setupIcon, { backgroundColor: `${iconColor}16`, width: s(34), height: s(34), borderRadius: s(12) }]}>
                    <Ionicons name={iconName} size={s(18)} color={iconColor} />
                </View>
                <View style={styles.setupCardBody}>
                    <View style={[styles.setupCardTitleRow, { gap: s(8) }]}>
                        <Text style={[styles.setupCardTitle, { color: theme.colors.text, fontSize: s(14), lineHeight: s(18) }]}>
                            {item.title}
                        </Text>
                        {onPress && (
                            <Ionicons name="chevron-forward" size={s(16)} color={theme.colors.textMuted} />
                        )}
                    </View>
                    {!compact && (
                        <Text style={[
                            styles.setupCardDescription,
                            { color: theme.colors.textSecondary, fontSize: s(12), lineHeight: s(17), marginTop: s(3) },
                        ]} numberOfLines={2}>
                            {item.description}
                        </Text>
                    )}
                    {children ?? (
                        <Text style={[
                            styles.setupCardValue,
                            { fontSize: s(14), lineHeight: s(19), marginTop: s(8) },
                            compact && [styles.setupCardValueCompact, { marginTop: s(4), fontSize: s(13), lineHeight: s(17) }],
                            { color: isWarning ? theme.colors.status.disconnected : theme.colors.text },
                        ]} numberOfLines={2}>
                            {item.value}
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );

    if (!onPress) {
        return card;
    }

    return (
        <Pressable
            {...getAccessibleActionProps(item.title)}
            onPress={onPress}
            style={({ pressed }) => [
                pressed && styles.configRowPressed,
            ]}
        >
            {card}
        </Pressable>
    );
}

function NewSessionScreen() {
    const { theme } = useUnistyles();
    const { s } = useSettingsScale();
    const safeArea = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const amberButtonVisuals = getAmberRaisedButtonVisuals(theme);
    const headerHeight = useHeaderHeight();
    const router = useRouter();
    const navigateToSession = useNavigateToSession();

    // Real data sources
    const allMachines = useAllMachines({ includeOffline: true });
    const sessions = useSessions();
    const agentInputEnterToSend = useSetting('agentInputEnterToSend');
    const auth = useAuth();

    // Credential state
    const [credentials, setCredentials] = React.useState<ManagedCredential[]>([]);
    const [credentialLoadFailed, setCredentialLoadFailed] = React.useState(false);
    const loadCredentials = React.useCallback(async (signal?: AbortSignal) => {
        const credentials = auth.credentials;
        const generation = sync.getAccountGeneration();
        if (!credentials || generation === null) return;
        const isCurrent = () => !signal?.aborted
            && sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;
        await runCredentialsLoad({
            fetchCredentials: () => listCredentials(credentials, signal),
            isCurrent,
            setCredentials,
            setLoadState: (state) => setCredentialLoadFailed(state === 'error'),
            setError: (error) => setCredentialLoadFailed(error !== null),
            errorMessage: t('credentials.loadFailed'),
        });
    }, [auth.credentials]);
    React.useEffect(() => {
        const controller = new AbortController();
        void loadCredentials(controller.signal);
        return () => controller.abort();
    }, [loadCredentials]);
    React.useEffect(() => {
        setCredentials([]);
        setCredentialLoadFailed(false);
    }, [auth.credentials?.token]);
    const supportedCredentials = React.useMemo(
        () => credentials.filter(
            (credential): credential is ManagedCredential & { agent: SupportedClientAgent } => isSupportedClientAgent(credential.agent),
        ),
        [credentials],
    );

    // Persisted draft state (survives navigation)
    const draft = useNewSessionDraft();
    const prompt = draft.input;
    const setPrompt = draft.setInput;
    const selectedAgent = draft.agentType;
    const setSelectedAgent = draft.setAgentType;
    const selectedMachineId = draft.selectedMachineId;
    const setSelectedMachineId = draft.setMachineId;
    const selectedPath = draft.selectedPath;
    const setSelectedPath = draft.setPath;
    const selectedCredentialId = draft.selectedCredentialId;
    const setSelectedCredentialId = draft.setCredentialId;
    const [worktreeKey, setWorktreeKey] = React.useState<string>(
        draft.worktreeKey ?? (draft.sessionType === 'worktree' ? '__new__' : '__none__')
    );
    React.useEffect(() => {
        draft.setSessionType(worktreeKey !== '__none__' ? 'worktree' : 'simple');
        draft.setWorktreeKey(worktreeKey === '__none__' || worktreeKey === '__new__' ? null : worktreeKey);
    }, [worktreeKey]);

    // Local-only UI state (not persisted)
    const [isSpawning, setIsSpawning] = React.useState(false);
    const [activePicker, setActivePicker] = React.useState<PickerType | null>(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = React.useState(false);
    const [codexRuntimeModels, setCodexRuntimeModels] = React.useState<ModelMode[] | null>(null);
    const [codexModelsLoading, setCodexModelsLoading] = React.useState(false);
    const [codexModelsFailed, setCodexModelsFailed] = React.useState(false);
    const [codexModelsRefreshKey, setCodexModelsRefreshKey] = React.useState(0);

    // Config collapse — auto-collapses when typing, expands when empty
    const [isConfigExpanded, setIsConfigExpanded] = React.useState(true);

    // Auto-select first machine when none selected (first-ever use, no draft)
    React.useEffect(() => {
        if (selectedMachineId) return;
        const initialMachineId = getInitialMachineId(allMachines);
        if (initialMachineId) {
            setSelectedMachineId(initialMachineId);
        }
    }, [allMachines, selectedMachineId]);

    const selectedMachine = React.useMemo(
        () => allMachines.find(m => m.id === selectedMachineId) ?? null,
        [allMachines, selectedMachineId],
    );
    const selectedHomeDir = selectedMachine?.metadata?.homeDir;

    // Build machine picker items: online first, then offline
    const machineItems = React.useMemo<PickerItem[]>(() => {
        const sorted = [...allMachines].sort((a, b) => {
            const aOnline = isMachineOnline(a) ? 0 : 1;
            const bOnline = isMachineOnline(b) ? 0 : 1;
            return aOnline - bOnline;
        });
        return sorted.map(m => ({
            key: m.id,
            label: getMachineName(m),
            subtitle: isMachineOnline(m) ? t('status.online') : t('status.lastSeen', { time: formatLastSeen(m.activeAt, false) }),
            dimmed: !isMachineOnline(m),
        }));
    }, [allMachines]);

    // Build path items from session history for selected machine
    const pathItems = React.useMemo<PickerItem[]>(() => {
        if (!selectedMachineId || !sessions) return [];
        const paths = new Set<string>();
        for (const s of sessions) {
            if (typeof s === 'string') continue;
            const session = s as Session;
            if (session.metadata?.machineId === selectedMachineId && session.metadata?.path) {
                paths.add(session.metadata.path);
            }
        }
        const homeDir = selectedMachine?.metadata?.homeDir;
        return Array.from(paths).sort().map(p => ({
            key: p,
            label: formatPathRelativeToHome(p, homeDir),
        }));
    }, [selectedMachineId, sessions, selectedMachine]);

    // Auto-select first path when machine changes
    React.useEffect(() => {
        if (!selectedMachineId || selectedPath !== null) {
            return;
        }

        setSelectedPath(pathItems[0]?.label ?? '~');
    }, [selectedMachineId, pathItems, selectedPath, setSelectedPath]);

    const resolvedSelectedPath = React.useMemo(() => {
        return normalizePathForComparison(selectedPath, selectedHomeDir);
    }, [selectedHomeDir, selectedPath]);

    const [debouncedResolvedSelectedPath, setDebouncedResolvedSelectedPath] = React.useState<string | null>(resolvedSelectedPath);

    React.useEffect(() => {
        if (!resolvedSelectedPath) {
            setDebouncedResolvedSelectedPath(null);
            return;
        }

        const timeout = setTimeout(() => {
            setDebouncedResolvedSelectedPath(resolvedSelectedPath);
        }, WORKTREE_PATH_DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [resolvedSelectedPath]);

    // Fetch existing worktrees from the selected machine/path
    const [worktreeItems, setWorktreeItems] = React.useState<PickerItem[]>([]);
    const [worktreeLoadFailed, setWorktreeLoadFailed] = React.useState(false);
    const [worktreeRefreshKey, setWorktreeRefreshKey] = React.useState(0);
    React.useEffect(() => {
        if (!selectedMachineId || !debouncedResolvedSelectedPath) {
            setWorktreeItems([]);
            setWorktreeLoadFailed(false);
            return;
        }
        if (!selectedMachine || !isMachineOnline(selectedMachine)) {
            setWorktreeItems([]);
            setWorktreeLoadFailed(false);
            return;
        }
        let cancelled = false;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => !cancelled
            && generation !== null
            && sync.getAccountGeneration() === generation;
        setWorktreeItems([]);
        setWorktreeLoadFailed(false);
        void runSessionActionRequest({
            isCurrent,
            request: () => listWorktrees(selectedMachineId, debouncedResolvedSelectedPath),
        }).then(result => {
                if (result === null || !isCurrent()) return;
                setWorktreeItems(result.map(wt => ({
                    key: wt.path,
                    label: wt.branch,
                    subtitle: wt.path,
                })));
            })
            .catch(() => {
                if (!isCurrent()) return;
                setWorktreeItems([]);
                setWorktreeLoadFailed(true);
            });
        return () => { cancelled = true; };
    }, [debouncedResolvedSelectedPath, selectedMachineId, selectedMachine, worktreeRefreshKey]);

    React.useEffect(() => {
        if (worktreeKey === '__none__' || worktreeKey === '__new__') {
            return;
        }

        if (!worktreeItems.some((item) => item.key === worktreeKey)) {
            setWorktreeKey('__none__');
        }
    }, [worktreeItems, worktreeKey]);

    // Filter available agents based on CLI availability from machine metadata
    const availableAgents = React.useMemo(() => {
        const availability = selectedMachine?.metadata?.cliAvailability;
        return getAvailableNewSessionAgents(availability);
    }, [selectedMachine]);

    // If current agent not available on this machine, switch to first available
    React.useEffect(() => {
        if (!availableAgents.find(a => a.key === selectedAgent)) {
            setSelectedAgent(availableAgents[0].key);
        }
    }, [availableAgents, selectedAgent, setSelectedAgent]);

    React.useEffect(() => {
        if (shouldClearSelectedCredential(supportedCredentials, selectedCredentialId, selectedAgent)) {
            setSelectedCredentialId(null);
        }
    }, [supportedCredentials, selectedCredentialId, selectedAgent, setSelectedCredentialId]);

    React.useEffect(() => {
        if (selectedAgent !== 'codex') {
            setCodexRuntimeModels(null);
            setCodexModelsLoading(false);
            setCodexModelsFailed(false);
            return;
        }
        if (!selectedMachineId || !resolvedSelectedPath || !selectedMachine || !isMachineOnline(selectedMachine)) {
            setCodexRuntimeModels(null);
            setCodexModelsLoading(false);
            return;
        }

        const controller = new AbortController();
        const generation = sync.getAccountGeneration();
        const credentials = auth.credentials;
        if (generation === null || !credentials) {
            setCodexRuntimeModels(null);
            setCodexModelsLoading(false);
            setCodexModelsFailed(false);
            return;
        }

        const isCurrent = () => !controller.signal.aborted
            && sync.getAccountGeneration() === generation
            && sync.getCredentials()?.token === credentials.token;
        let cancelled = false;
        setCodexModelsLoading(true);
        setCodexModelsFailed(false);
        void (async () => {
            let environmentVariables: Record<string, string> | undefined;
            if (selectedCredentialId) {
                environmentVariables = await getCredentialEnvVars(credentials, selectedCredentialId, {
                    machineId: selectedMachineId,
                }, controller.signal);
            }
            if (!isCurrent()) return;
            const catalog = await machineListCodexModels(
                selectedMachineId,
                resolvedSelectedPath,
                environmentVariables,
            );
            if (!isCurrent()) return;
            if (!cancelled) {
                setCodexRuntimeModels(getCodexRuntimeModelModes(catalog.models, t));
            }
        })().catch(() => {
            if (!cancelled && isCurrent()) {
                setCodexRuntimeModels(null);
                setCodexModelsFailed(true);
            }
        }).finally(() => {
            if (!cancelled && isCurrent()) setCodexModelsLoading(false);
        });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [
        auth.credentials,
        codexModelsRefreshKey,
        resolvedSelectedPath,
        selectedAgent,
        selectedCredentialId,
        selectedMachine,
        selectedMachineId,
    ]);

    // Derive options from agent type
    const permissionModes = React.useMemo<PermissionMode[]>(
        () => getHardcodedPermissionModes(selectedAgent, t),
        [selectedAgent],
    );
    const modelModes = React.useMemo<ModelMode[]>(
        () => selectedAgent === 'codex' && codexRuntimeModels
            ? codexRuntimeModels
            : getHardcodedModelModes(selectedAgent, t),
        [codexRuntimeModels, selectedAgent],
    );

    const currentModel = resolveModeSelection(modelModes, draft.modelMode, getDefaultModelKey(selectedAgent));
    const currentModelKey = currentModel?.key ?? 'default';

    const effortLevels = React.useMemo<EffortLevel[]>(
        () => getEffortLevelsForModel(selectedAgent, currentModelKey, t, modelModes),
        [selectedAgent, currentModelKey, modelModes],
    );

    const supportsWorktree = getSupportsWorktree(selectedAgent);
    const showModel = modelModes.length > 1;
    const showEffort = effortLevels.length > 0;
    const showPermission = permissionModes.length > 1;
    const showCredentialRow = shouldShowCredentialSelectorRow(supportedCredentials, selectedAgent);
    const translateSetupCopy = React.useCallback((key: NewSessionSetupCopyKey) => t(key), []);

    React.useEffect(() => {
        if (!supportsWorktree) setWorktreeKey('__none__');
    }, [supportsWorktree]);

    const hasText = prompt.trim().length > 0;

    // Auto collapse config once when user starts typing (mobile only)
    // On desktop (web / Mac Catalyst) the panel stays expanded
    // Also skip collapsing on the initial render when draft text is restored
    const hasCollapsedOnceRef = React.useRef(false);
    const isInitialRef = React.useRef(true);
    const isDesktop = Platform.OS === 'web' || isRunningOnMac();
    React.useEffect(() => {
        if (isInitialRef.current) {
            isInitialRef.current = false;
            return;
        }
        if (isDesktop) return;
        if (hasText && !hasCollapsedOnceRef.current) {
            hasCollapsedOnceRef.current = true;
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIsConfigExpanded(false);
        }
    }, [hasText]);


    const toggleConfig = React.useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsConfigExpanded(v => !v);
    }, []);

    const togglePicker = React.useCallback((type: PickerType) => {
        Keyboard.dismiss();
        setActivePicker(v => v === type ? null : type);
    }, []);

    const cyclePermission = React.useCallback(() => {
        if (permissionModes.length === 0) return null;
        const current = resolveModeSelection(permissionModes, draft.permissionMode, getInitialPermissionModeKey(selectedAgent));
        const currentIndex = current ? permissionModes.findIndex(mode => mode.key === current.key) : -1;
        const next = permissionModes[(currentIndex + 1) % permissionModes.length] ?? permissionModes[0];
        draft.setPermissionMode(next.key);
        return next;
    }, [draft.permissionMode, draft.setPermissionMode, permissionModes, selectedAgent]);

    const cycleModel = React.useCallback(() => {
        if (modelModes.length === 0) return null;
        const current = resolveModeSelection(modelModes, draft.modelMode, getDefaultModelKey(selectedAgent));
        const currentIndex = current ? modelModes.findIndex(mode => mode.key === current.key) : -1;
        const next = modelModes[(currentIndex + 1) % modelModes.length] ?? modelModes[0];
        draft.setModelMode(next.key);
        return next;
    }, [draft.modelMode, draft.setModelMode, modelModes, selectedAgent]);

    const cycleEffort = React.useCallback(() => {
        if (effortLevels.length === 0) return null;
        const defaultEffortKey = getDefaultEffortKeyForModel(selectedAgent, currentModelKey, modelModes) ?? effortLevels[0]?.key ?? '';
        const current = resolveModeSelection(effortLevels, draft.effortLevel, defaultEffortKey);
        const currentIndex = current ? effortLevels.findIndex(level => level.key === current.key) : -1;
        const next = effortLevels[(currentIndex + 1) % effortLevels.length] ?? effortLevels[0];
        draft.setEffortLevel(next.key);
        return next;
    }, [currentModelKey, draft.effortLevel, draft.setEffortLevel, effortLevels, modelModes, selectedAgent]);

    const getNextAgent = React.useCallback(() => {
        const nextKey = getNextNewSessionAgentKey(availableAgents, selectedAgent);
        return availableAgents.find(a => a.key === nextKey) ?? availableAgents[0];
    }, [availableAgents, selectedAgent]);

    const cycleAgent = React.useCallback(() => {
        setSelectedAgent(getNextAgent().key);
    }, [getNextAgent, setSelectedAgent]);

    const isOffline = selectedMachine ? !isMachineOnline(selectedMachine) : false;
    const agent = availableAgents.find(a => a.key === selectedAgent) ?? ALL_AGENTS[0];
    const currentPermission = resolveModeSelection(permissionModes, draft.permissionMode, getInitialPermissionModeKey(selectedAgent));
    const defaultEffortKey = getDefaultEffortKeyForModel(selectedAgent, currentModelKey, modelModes) ?? effortLevels[0]?.key ?? '';
    const currentEffort = resolveModeSelection(effortLevels, draft.effortLevel, defaultEffortKey);
    const permissionStyle = currentPermission?.key !== 'default' ? getPermissionStyle(currentPermission?.key ?? 'default') : null;

    // Display values
    const machineName = selectedMachine ? getMachineName(selectedMachine) : t('newSession.selectMachine');
    const pathName = trimPathInput(selectedPath)
        ? formatPathRelativeToHome(trimPathInput(selectedPath), selectedHomeDir)
        : '~';
    const worktreeLabel = worktreeKey === '__none__'
        ? t('newSession.noWorktree')
        : worktreeKey === '__new__'
            ? t('newSession.newWorktree')
            : worktreeItems.find(wt => wt.key === worktreeKey)?.label || worktreeKey;
    const selectedAgentCredentials = React.useMemo(
        () => supportedCredentials.filter(c => c.agent === selectedAgent),
        [supportedCredentials, selectedAgent],
    );
    const credentialLabel = selectedCredentialId
        ? selectedAgentCredentials.find(c => c.id === selectedCredentialId)?.label ?? t('newSession.useHostCredentials')
        : t('newSession.useHostCredentials');

    const configItems = React.useMemo(() => getNewSessionConfigItems({
        machineName,
        machineOnline: !!selectedMachine && isMachineOnline(selectedMachine),
        pathName,
        agentLabel: agent.label,
        modelName: currentModel?.name,
        effortName: currentEffort?.name,
        permissionName: currentPermission?.name,
        credentialLabel: credentialLoadFailed ? `${t('common.unknownError')} · ${t('common.retry')}` : credentialLabel,
        worktreeLabel: worktreeLoadFailed ? `${t('common.unknownError')} · ${t('common.retry')}` : worktreeLabel,
        showModel,
        showEffort,
        showPermission,
        showCredential: showCredentialRow,
        showWorktree: supportsWorktree,
        translate: translateSetupCopy,
    }), [
        machineName,
        selectedMachine,
        pathName,
        agent.label,
        currentModel?.name,
        currentEffort?.name,
        currentPermission?.name,
        credentialLoadFailed,
        credentialLabel,
        worktreeLoadFailed,
        worktreeLabel,
        showModel,
        showEffort,
        showPermission,
        showCredentialRow,
        supportsWorktree,
        translateSetupCopy,
    ]);
    const primaryConfigItems = React.useMemo(
        () => configItems.filter((item) => item.priority === 'primary'),
        [configItems],
    );
    const advancedConfigItems = React.useMemo(
        () => configItems.filter((item) => item.priority === 'advanced'),
        [configItems],
    );

    const handleConfigItemPress = React.useCallback((key: NewSessionConfigItem['key']) => {
        switch (key) {
            case 'machine':
                togglePicker('machine');
                break;
            case 'path':
                Keyboard.dismiss();
                router.push('/new/path');
                break;
            case 'agent':
                cycleAgent();
                break;
            case 'permission':
                cyclePermission();
                break;
            case 'credential':
                togglePicker('credential');
                break;
            case 'worktree':
                togglePicker('worktree');
                break;
        }
    }, [togglePicker, cycleAgent, cyclePermission, router]);

    // Flash label for collapsed icon taps — shows label briefly above the icon
    const flashOpacity = React.useRef(new Animated.Value(0)).current;
    const [flashText, setFlashText] = React.useState('');
    const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const showFlash = React.useCallback((text: string) => {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setFlashText(text);
        flashOpacity.setValue(0);
        Animated.timing(flashOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
        flashTimerRef.current = setTimeout(() => {
            Animated.timing(flashOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }, 800);
    }, [flashOpacity]);

    // Picker data derived from active picker type
    const pickerData = React.useMemo(() => {
        switch (activePicker) {
            case 'machine':
                return { title: t('newSession.machine'), items: machineItems, selectedKey: selectedMachineId, searchPlaceholder: t('newSession.searchMachines') };
            case 'worktree':
                return { title: t('newSession.worktree'), fixedItems: WORKTREE_FIXED_ITEMS, items: worktreeItems, selectedKey: worktreeKey, searchPlaceholder: t('newSession.searchWorktrees') };
            case 'credential':
                return {
                    title: t('newSession.selectCredential'),
                    fixedItems: [
                        { key: '__host__', label: t('newSession.useHostCredentials') },
                        { key: '__add__', label: t('credentials.addCredential'), subtitle: t('credentials.noCredentialsSubtitle') },
                        ...(selectedAgentCredentials.length > 0 ? [{ key: '__manage__', label: t('credentials.title') }] : []),
                    ],
                    items: selectedAgentCredentials.map(c => ({ key: c.id, label: c.label, subtitle: c.baseUrl ?? undefined })),
                    selectedKey: selectedCredentialId ?? '__host__',
                    searchPlaceholder: t('newSession.searchCredentials'),
                };
            default:
                return null;
        }
    }, [activePicker, machineItems, selectedMachineId, worktreeKey, worktreeItems, selectedAgentCredentials, selectedCredentialId]);

    const handlePickerSelect = React.useCallback((key: string) => {
        switch (activePicker) {
            case 'machine':
                setSelectedMachineId(key);
                setSelectedPath(null);
                setWorktreeKey('__none__');
                setSelectedCredentialId(null);
                break;
            case 'worktree':
                setWorktreeKey(key);
                break;
            case 'credential':
                if (key === '__add__') {
                    setActivePicker(null);
                    router.push('/settings/credentials/edit');
                    return;
                }
                if (key === '__manage__') {
                    setActivePicker(null);
                    router.push('/settings/credentials');
                    return;
                }
                setSelectedCredentialId(key === '__host__' ? null : key);
                break;
        }
        setActivePicker(null);
    }, [activePicker, router, setSelectedMachineId, setWorktreeKey, setSelectedCredentialId]);

    // Spawn session handler
    const handleSend = React.useCallback(async (approvedNewDirectoryCreation: boolean = false) => {
        if (!selectedMachineId || !selectedMachine) {
            Modal.alert(t('common.error'), t('newSession.selectMachine'));
            return;
        }
        if (!isMachineOnline(selectedMachine)) {
            Modal.alert(t('common.error'), t('newSession.machineOfflineShort'));
            return;
        }

        const generation = sync.getAccountGeneration();
        if (generation === null) return;
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;

        setIsSpawning(true);
        try {
            // The draft can outlive a machine change. Revalidate the agent and
            // all dependent options at the launch boundary so a stale Claude
            // selection cannot spawn on a Codex-only machine (or carry over
            // incompatible model/permission values).
            const launchAgent = resolveNewSessionAgent(
                selectedAgent,
                selectedMachine.metadata?.cliAvailability,
            );
            const agentChanged = launchAgent !== selectedAgent;
            const launchPermissionModes = agentChanged
                ? getHardcodedPermissionModes(launchAgent, t)
                : permissionModes;
            const launchModelModes = agentChanged
                ? launchAgent === 'codex' && codexRuntimeModels
                    ? codexRuntimeModels
                    : getHardcodedModelModes(launchAgent, t)
                : modelModes;
            const launchPermission = resolveModeSelection(
                launchPermissionModes,
                agentChanged ? null : draft.permissionMode,
                getInitialPermissionModeKey(launchAgent),
            );
            const launchModel = resolveModeSelection(
                launchModelModes,
                agentChanged ? null : draft.modelMode,
                getDefaultModelKey(launchAgent),
            );
            const launchModelKey = launchModel?.key ?? 'default';
            const launchEffortLevels = getEffortLevelsForModel(
                launchAgent,
                launchModelKey,
                t,
                launchModelModes,
            );
            const launchDefaultEffortKey = getDefaultEffortKeyForModel(
                launchAgent,
                launchModelKey,
                launchModelModes,
            ) ?? launchEffortLevels[0]?.key ?? '';
            const launchEffort = resolveModeSelection(
                launchEffortLevels,
                agentChanged ? null : draft.effortLevel,
                launchDefaultEffortKey,
            );
            const pathToUse = trimPathInput(selectedPath) || '~';
            const absolutePath = resolveAbsolutePath(pathToUse, selectedMachine.metadata?.homeDir);

            // Handle worktree selection
            let spawnDirectory = absolutePath;
            if (worktreeKey === '__new__') {
                const worktreeResult = await runSessionActionRequest({
                    isCurrent,
                    request: () => createWorktree(selectedMachineId, absolutePath),
                });
                if (worktreeResult === null) return;
                if (!worktreeResult.success) {
                    Modal.alert(t('common.error'), worktreeResult.error || t('newSession.failedToCreateWorktree'));
                    return;
                }
                spawnDirectory = worktreeResult.worktreePath;
            } else if (worktreeKey !== '__none__') {
                // Existing worktree — use its path directly
                spawnDirectory = worktreeKey;
            }

            // Persist last used settings
            if (!isCurrent()) return;
            sync.applySettings({
                lastUsedAgent: launchAgent,
                lastUsedPermissionMode: launchPermission?.key ?? 'default',
                lastUsedModelMode: launchModelKey,
            });

            // Resolve credential env vars if selected
            let credentialEnvVars: Record<string, string> | undefined;
            const launchCredentialId = agentChanged ? null : selectedCredentialId;
            const credentials = auth.credentials;
            if (launchCredentialId && credentials) {
                const resolvedCredentialEnvVars = await runSessionActionRequest({
                    isCurrent,
                    request: () => getCredentialEnvVars(credentials, launchCredentialId, { machineId: selectedMachineId }),
                });
                if (resolvedCredentialEnvVars === null) return;
                credentialEnvVars = resolvedCredentialEnvVars;
            }

            const result = await runSessionActionRequest({
                isCurrent,
                request: () => machineSpawnNewSession({
                    machineId: selectedMachineId,
                    directory: spawnDirectory,
                    approvedNewDirectoryCreation,
                    agent: launchAgent,
                    permissionMode: launchAgent === 'codex' ? (launchPermission?.key ?? 'default') : undefined,
                    model: launchAgent === 'codex' && launchModelKey !== 'default' ? launchModelKey : undefined,
                    environmentVariables: credentialEnvVars,
                }),
            });
            if (result === null) return;

            switch (result.type) {
                case 'success':
                    if (!isCurrent()) return;
                    {
                        const projectKey = buildProjectKey(selectedMachineId, spawnDirectory);
                        const currentCustomizations = storage.getState().settings.projectCustomizations;
                        const restoredCustomizations = restoreProjectCustomizationForExplicitSession(
                            currentCustomizations,
                            projectKey,
                        );
                        if (restoredCustomizations !== currentCustomizations) {
                            sync.applySettings({ projectCustomizations: restoredCustomizations });
                        }
                    }
                    const refreshed = await runSessionActionRequest({
                        isCurrent,
                        request: () => sync.refreshSessions(),
                    });
                    if (refreshed === null) return;

                    // Set permission mode and model on the session before sending
                    if (!isCurrent()) return;
                    storage.getState().updateSessionPermissionMode(result.sessionId, launchPermission?.key ?? 'default');
                    storage.getState().updateSessionModelMode(result.sessionId, launchModelKey);
                    if (launchEffort?.key) {
                        storage.getState().updateSessionEffortLevel(result.sessionId, launchEffort.key);
                    }

                    // Clear input text so draft doesn't repeat the sent message
                    setPrompt('');

                    // Send initial message if provided
                    if (prompt.trim()) {
                        await sync.sendMessage(result.sessionId, prompt.trim(), { source: 'new_session' });
                    }

                    if (!isCurrent()) return;
                    router.back();
                    navigateToSession(result.sessionId);
                    break;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm(
                        t('newSession.createDirectory'),
                        t('newSession.createDirectoryMessage', { path: result.directory }),
                        { cancelText: t('common.cancel'), confirmText: t('common.create') },
                    );
                    if (approved && isCurrent()) {
                        await handleSend(true);
                    }
                    break;
                }
                case 'error':
                    if (isCurrent()) Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : t('newSession.failedToStartSession');
            if (isCurrent()) Modal.alert(t('common.error'), errorMessage);
        } finally {
            if (isCurrent()) setIsSpawning(false);
        }
    }, [selectedMachineId, selectedMachine, selectedPath, selectedAgent, prompt, router, navigateToSession, permissionModes, modelModes, codexRuntimeModels, draft.permissionMode, draft.modelMode, draft.effortLevel, worktreeKey, selectedCredentialId, auth.credentials]);

    const canSend = selectedMachineId && selectedMachine && isMachineOnline(selectedMachine) && !isSpawning;

    const renderConfigItem = React.useCallback((item: NewSessionConfigItem, compact = false) => {
        if (item.key === 'credential' && credentialLoadFailed) {
            return (
                <NewSessionSetupCard
                    key={item.key}
                    item={item}
                    compact={compact}
                    onPress={() => handleConfigItemPress(item.key)}
                >
                    <View style={styles.setupChipRow}>
                        <Text style={[styles.setupCardValue, { color: theme.colors.status.disconnected, flex: 1 }]} numberOfLines={1}>
                            {t('common.unknownError')}
                        </Text>
                        <Pressable
                            {...getAccessibleActionProps(t('common.retry'))}
                            onPress={() => { void loadCredentials(); }}
                            style={({ pressed }) => [styles.setupChip, pressed && styles.configRowPressed]}
                        >
                            <Ionicons name="refresh" size={14} color={theme.colors.accent} />
                        </Pressable>
                    </View>
                </NewSessionSetupCard>
            );
        }

        if (item.key === 'worktree' && worktreeLoadFailed) {
            return (
                <NewSessionSetupCard
                    key={item.key}
                    item={item}
                    compact={compact}
                    onPress={() => handleConfigItemPress(item.key)}
                >
                    <View style={styles.setupChipRow}>
                        <Text style={[styles.setupCardValue, { color: theme.colors.status.disconnected, flex: 1 }]} numberOfLines={1}>
                            {t('common.unknownError')}
                        </Text>
                        <Pressable
                            {...getAccessibleActionProps(t('common.retry'))}
                            onPress={() => setWorktreeRefreshKey((value) => value + 1)}
                            style={({ pressed }) => [styles.setupChip, pressed && styles.configRowPressed]}
                        >
                            <Ionicons name="refresh" size={14} color={theme.colors.accent} />
                        </Pressable>
                    </View>
                </NewSessionSetupCard>
            );
        }

        if (item.key === 'agent') {
            return (
                <NewSessionSetupCard key={item.key} item={item} compact={compact}>
                    <View style={styles.setupChipRow}>
                        <Pressable
                            {...getAccessibleActionProps(`${t('newSession.setup.agent.title')}: ${agent.label}`)}
                            onPress={cycleAgent}
                            style={({ pressed }) => [
                                styles.setupChip,
                                pressed && styles.configRowPressed,
                            ]}
                        >
                            <RNImage
                                source={agentIcons[agent.key]}
                                style={[styles.setupAgentIcon, { tintColor: theme.colors.accent }]}
                                resizeMode="contain"
                            />
                            <Text style={[styles.setupChipText, { color: theme.colors.text }]} numberOfLines={1}>
                                {agent.label}
                            </Text>
                        </Pressable>
                        {showModel && (
                            <Pressable
                                {...getAccessibleActionProps(`${t('newSession.setup.agent.title')}: ${currentModel?.name ?? ''}`)}
                                onPress={cycleModel}
                                style={({ pressed }) => [
                                    styles.setupChip,
                                    pressed && styles.configRowPressed,
                                ]}
                            >
                                <Text style={[styles.setupChipText, { color: theme.colors.text }]} numberOfLines={1}>
                                    {currentModel?.name}
                                </Text>
                            </Pressable>
                        )}
                        {selectedAgent === 'codex' && codexModelsLoading && (
                            <ActivityIndicator
                                size="small"
                                color={theme.colors.accent}
                                accessibilityLabel={t('common.loading')}
                            />
                        )}
                        {selectedAgent === 'codex' && codexModelsFailed && (
                            <Pressable
                                {...getAccessibleActionProps(`${t('common.unknownError')}. ${t('common.retry')}`)}
                                onPress={() => setCodexModelsRefreshKey((value) => value + 1)}
                                style={({ pressed }) => [
                                    styles.setupChip,
                                    pressed && styles.configRowPressed,
                                ]}
                            >
                                <Ionicons name="refresh" size={14} color={theme.colors.accent} />
                            </Pressable>
                        )}
                        {showEffort && (
                            <Pressable
                                {...getAccessibleActionProps(`${t('newSession.advancedSettings')}: ${currentEffort?.name ?? ''}`)}
                                onPress={cycleEffort}
                                style={({ pressed }) => [
                                    styles.setupChip,
                                    pressed && styles.configRowPressed,
                                ]}
                            >
                                <Ionicons name="speedometer-outline" size={14} color={theme.colors.accent} />
                                <Text style={[styles.setupChipText, { color: theme.colors.text }]} numberOfLines={1}>
                                    {currentEffort?.name}
                                </Text>
                            </Pressable>
                        )}
                    </View>
                </NewSessionSetupCard>
            );
        }

        return (
            <NewSessionSetupCard
                key={item.key}
                item={item}
                compact={compact}
                onPress={() => handleConfigItemPress(item.key)}
            />
        );
    }, [
        agent.key,
        agent.label,
        currentEffort?.name,
        currentModel?.name,
        codexModelsFailed,
        codexModelsLoading,
        cycleAgent,
        cycleEffort,
        cycleModel,
        credentialLoadFailed,
        handleConfigItemPress,
        loadCredentials,
        showEffort,
        showModel,
        selectedAgent,
        theme.colors.accent,
        theme.colors.text,
        theme.colors.status.disconnected,
        setWorktreeRefreshKey,
        worktreeLoadFailed,
    ]);

    const renderAdvancedPill = React.useCallback((item: NewSessionConfigItem) => {
        const iconName = NEW_SESSION_ITEM_ICONS[item.key];
        const retry = item.key === 'credential' && credentialLoadFailed
            ? () => { void loadCredentials(); }
            : item.key === 'worktree' && worktreeLoadFailed
                ? () => setWorktreeRefreshKey((value) => value + 1)
                : null;
        return (
            <Pressable
                key={item.key}
                {...getAccessibleActionProps(`${item.title}: ${item.value}`)}
                onPress={() => {
                    if (retry) {
                        retry();
                        return;
                    }
                    if (!showAdvancedSettings) {
                        setShowAdvancedSettings(true);
                        return;
                    }
                    handleConfigItemPress(item.key);
                }}
                style={({ pressed }) => [
                    styles.advancedPill,
                    pressed && styles.configRowPressed,
                ]}
            >
                <Ionicons name={iconName} size={14} color={theme.colors.accent} />
                <Text style={[styles.advancedPillText, { color: theme.colors.text }]} numberOfLines={2}>
                    {item.value}
                </Text>
            </Pressable>
        );
    }, [credentialLoadFailed, handleConfigItemPress, loadCredentials, setWorktreeRefreshKey, showAdvancedSettings, theme.colors.accent, theme.colors.text, worktreeLoadFailed]);

    // Handle Enter/Cmd+Enter to send on web
    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        if (Platform.OS === 'web' && event.key === 'Enter' && !event.shiftKey && agentInputEnterToSend) {
            if (canSend) {
                handleSend();
                return true;
            }
        }
        return false;
    }, [agentInputEnterToSend, canSend, handleSend]);

    const composerInputRef = React.useRef<import('@/components/MultiTextInput').MultiTextInputHandle>(null);
    const composerLineHeight = s(MULTI_TEXT_INPUT_LINE_HEIGHT);
    const composerPaddingVertical = Math.max(11, s(COMPOSER_INPUT_VERTICAL_PADDING));
    const sendButtonSize = Math.max(MINIMUM_TAP_TARGET + 2, s(COMPOSER_SEND_BUTTON_SIZE));
    const sendButtonMarginBottom = Math.max(
        0,
        Math.round((composerLineHeight + composerPaddingVertical * 2 - sendButtonSize) / 2),
    );
    const sendButtonHighlightGeometry = getComposerSendButtonHighlightGeometry(s);

    return (
        <KeyboardAvoidingView
            role="main"
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? Constants.statusBarHeight + headerHeight : 0}
            style={styles.container}
        >
            <LinearGradient
                pointerEvents="none"
                colors={theme.dark
                    ? ['rgba(255, 255, 255, 0.022)', 'rgba(255, 255, 255, 0)', 'rgba(255, 178, 46, 0.012)']
                    : ['rgba(255, 255, 255, 0.76)', 'rgba(232, 241, 244, 0.42)', 'rgba(217, 144, 18, 0.024)']}
                start={{ x: 0.03, y: 0 }}
                end={{ x: 0.98, y: 1 }}
                style={styles.backgroundTexture}
            />
            {!theme.dark && (
                <>
                    <View pointerEvents="none" style={[styles.backgroundSheen, { top: '18%', left: '-6%' }]} />
                    <View pointerEvents="none" style={[styles.backgroundSheen, { top: '74%', right: '-16%', opacity: 0.44 }]} />
                </>
            )}
            <View style={styles.inner}>
                {Platform.OS === 'web' && (
                    <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                        {t('newSession.title')}
                    </Text>
                )}
                <ScrollView
                    style={styles.contentScroll}
                    contentContainerStyle={[
                        styles.contentScrollContent,
                        {
                            paddingHorizontal: s(12),
                            paddingBottom: s(18),
                            paddingTop: Platform.OS === 'web' ? s(72) : s(12),
                        },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.contentColumn, { gap: s(8) }]}>

                    {/* Config box */}
                    <GlassSurface
                        tone="floating"
                        style={[
                            styles.configBox,
                            {
                                borderRadius: Platform.select({ default: s(16), android: s(20) }),
                                paddingVertical: s(10),
                                paddingHorizontal: s(10),
                            },
                        ]}
                    >
                        {isConfigExpanded ? (
                            <>
                                <View style={[styles.setupHeader, { gap: s(8), paddingHorizontal: s(4), paddingBottom: s(8) }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.setupTitle, { color: theme.colors.text, fontSize: s(18), lineHeight: s(23) }]}>
                                            {t('newSession.setupTitle')}
                                        </Text>
                                        <Text style={[styles.setupSubtitle, { color: theme.colors.textSecondary, fontSize: s(13), lineHeight: s(18), marginTop: s(2) }]} numberOfLines={2}>
                                            {t('newSession.setupSubtitle')}
                                        </Text>
                                    </View>
                                    <Pressable
                                        {...getAccessibleActionProps(t('newSession.setupTitle'), { expanded: true })}
                                        onPress={toggleConfig}
                                        hitSlop={{ top: s(8), bottom: s(8), left: s(8), right: s(8) }}
                                        style={(p) => [styles.collapseToggle, { paddingHorizontal: s(12), paddingVertical: s(10) }, p.pressed && styles.configRowPressed]}
                                    >
                                        <Ionicons name="chevron-up" size={s(16)} color={theme.colors.textSecondary} />
                                    </Pressable>
                                </View>

                                <View style={[styles.setupGrid, { gap: s(7) }]}>
                                    {primaryConfigItems.map(item => renderConfigItem(item, true))}
                                </View>

                                {advancedConfigItems.length > 0 && (
                                    <View style={[
                                        styles.advancedPanel,
                                        {
                                            marginTop: s(9),
                                            borderRadius: s(14),
                                        },
                                    ]}>
                                        <Pressable
                                            {...getAccessibleActionProps(t('newSession.advancedSettings'), { expanded: showAdvancedSettings })}
                                            onPress={() => setShowAdvancedSettings(v => !v)}
                                            style={({ pressed }) => [
                                                styles.advancedHeader,
                                                { minHeight: Math.max(MINIMUM_TAP_TARGET, s(42)), paddingHorizontal: s(12), gap: s(8) },
                                                pressed && styles.configRowPressed,
                                            ]}
                                        >
                                            <View style={[styles.advancedTitleRow, { gap: s(7) }]}>
                                                <Ionicons name="options-outline" size={s(15)} color={theme.colors.accent} />
                                                <Text style={[styles.advancedTitle, { color: theme.colors.text, fontSize: s(13), lineHeight: s(17) }]}>
                                                    {t('newSession.advancedSettings')}
                                                </Text>
                                            </View>
                                            <Ionicons
                                                name={showAdvancedSettings ? 'chevron-up' : 'chevron-down'}
                                                size={s(15)}
                                                color={theme.colors.textSecondary}
                                            />
                                        </Pressable>
                                        {!showAdvancedSettings ? (
                                            <View style={[styles.advancedPillRow, { paddingHorizontal: s(10), paddingBottom: s(10), gap: s(8) }]}>
                                                {advancedConfigItems.map(renderAdvancedPill)}
                                            </View>
                                        ) : (
                                            <View style={[styles.advancedExpandedList, { gap: s(7), paddingHorizontal: s(8), paddingBottom: s(8) }]}>
                                                {advancedConfigItems.map(item => renderConfigItem(item, true))}
                                            </View>
                                        )}
                                    </View>
                                )}

                                {isOffline && (
                                    <View style={[styles.offlineHelp, { gap: s(8), paddingHorizontal: s(12), paddingVertical: s(10), borderRadius: s(12) }]}>
                                        <Ionicons name="cloud-offline-outline" size={s(14)} color={theme.colors.status.disconnected} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.offlineHelpTitle, { color: theme.colors.status.disconnected, fontSize: s(13), marginBottom: s(4) }]}>
                                                {t('newSession.machineOffline')}
                                            </Text>
                                            <Text style={[styles.offlineHelpText, { color: theme.colors.textSecondary, fontSize: s(12), lineHeight: s(18) }]}>
                                                {t('machine.offlineHelp')}
                                                {'\n'}{t('newSession.switchMachinesHint')}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </>
                        ) : (
                            /* Collapsed: path row + icons row + optional offline warning */
                            <>
                                {/* Path row with expand chevron */}
                                <View style={styles.configRowWithToggle}>
                                    <Pressable
                                        style={(p) => [
                                            styles.collapsedRow,
                                            {
                                                flex: 1,
                                                gap: s(8),
                                                paddingHorizontal: s(12),
                                                paddingVertical: s(10),
                                                borderRadius: s(12),
                                            },
                                            p.pressed && styles.configRowPressed,
                                        ]}
                                        onPress={() => { Keyboard.dismiss(); router.push('/new/path'); }}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('newSession.browseFolderAccessibility', { folder: pathName })}
                                    >
                                        <Ionicons name="folder-outline" size={s(15)} color={theme.colors.textSecondary} />
                                        <Text style={[styles.configLabel, { flex: 1, fontSize: s(14) }]} numberOfLines={1}>
                                            {pathName}
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        {...getAccessibleActionProps(t('newSession.setupTitle'), { expanded: false })}
                                        onPress={toggleConfig}
                                        hitSlop={{ top: s(8), bottom: s(8), left: s(8), right: s(8) }}
                                        style={(p) => [styles.collapseToggle, { paddingHorizontal: s(12), paddingVertical: s(10) }, p.pressed && styles.configRowPressed]}
                                    >
                                        <Ionicons name="chevron-down" size={s(16)} color={theme.colors.textSecondary} />
                                    </Pressable>
                                </View>

                                {/* Tappable icons row: machine, agent, permission, worktree */}
                                <View style={[styles.collapsedIconsRow, { gap: s(2), paddingHorizontal: s(4), paddingBottom: s(8) }]}>
                                    {/* Machine */}
                                    <Pressable
                                        onPress={() => togglePicker('machine')}
                                        hitSlop={{ top: s(4), bottom: s(4), left: s(4), right: s(4) }}
                                        style={(p) => [styles.collapsedIconButton, { borderRadius: s(8) }, p.pressed && styles.configRowPressed]}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('newSession.selectMachineAccessibility', { machine: machineName })}
                                    >
                                        <Ionicons name="desktop-outline" size={s(14)} color={isOffline ? theme.colors.status.disconnected : theme.colors.textSecondary} />
                                    </Pressable>

                                    {/* Agent */}
                                    <Pressable
                                        onPress={() => {
                                            const nextAgent = getNextAgent();
                                            setSelectedAgent(nextAgent.key);
                                            showFlash(nextAgent.label);
                                        }}
                                        hitSlop={{ top: s(4), bottom: s(4), left: s(4), right: s(4) }}
                                        style={(p) => [styles.collapsedIconButton, { borderRadius: s(8) }, p.pressed && styles.configRowPressed]}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('newSession.switchAgentAccessibility', { agent: agent.label })}
                                    >
                                        <RNImage
                                            source={agentIcons[agent.key]}
                                            style={[styles.collapsedAgentIcon, { tintColor: theme.colors.textSecondary, width: s(14), height: s(14) }]}
                                            resizeMode="contain"
                                        />
                                    </Pressable>

                                    {/* Permission */}
                                    {showPermission && (
                                        <Pressable
                                            onPress={() => { showFlash(cyclePermission()?.name ?? 'default'); }}
                                            hitSlop={{ top: s(4), bottom: s(4), left: s(4), right: s(4) }}
                                            style={(p) => [styles.collapsedIconButton, { borderRadius: s(8) }, p.pressed && styles.configRowPressed]}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('newSession.switchPermissionAccessibility', { mode: currentPermission?.name ?? 'default' })}
                                        >
                                            <Ionicons
                                                name={permissionStyle?.icon ?? 'shield-outline'}
                                                size={s(14)}
                                                color={permissionStyle?.color ?? theme.colors.textSecondary}
                                            />
                                        </Pressable>
                                    )}

                                    {/* Worktree */}
                                    {supportsWorktree && (
                                        <Pressable
                                            onPress={() => togglePicker('worktree')}
                                            hitSlop={{ top: s(4), bottom: s(4), left: s(4), right: s(4) }}
                                            style={(p) => [styles.collapsedIconButton, { borderRadius: s(8) }, p.pressed && styles.configRowPressed]}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('newSession.selectWorktreeAccessibility', { worktree: worktreeLabel })}
                                        >
                                                    <Octicons name="git-branch" size={s(14)} color={theme.colors.textSecondary} />
                                        </Pressable>
                                    )}
                                </View>

                                {/* Offline warning in collapsed state */}
                                {isOffline && (
                                    <View style={[styles.offlineHelp, { gap: s(8), paddingHorizontal: s(12), paddingVertical: s(10), borderRadius: s(12) }]}>
                                        <Ionicons name="cloud-offline-outline" size={s(14)} color={theme.colors.status.disconnected} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.offlineHelpTitle, { color: theme.colors.status.disconnected, fontSize: s(13), marginBottom: s(4) }]}>
                                                {t('newSession.machineOffline')}
                                            </Text>
                                            <Text style={[styles.offlineHelpText, { color: theme.colors.textSecondary, fontSize: s(12), lineHeight: s(18) }]}>
                                                {t('machine.offlineHelp')}
                                                {'\n'}{t('newSession.switchMachinesHint')}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </GlassSurface>

                    {/* Flash label — centered below config box, hidden when picker is open */}
                    {flashText !== '' && !activePicker && (
                        <Animated.View style={[styles.flashLabel, { opacity: flashOpacity, pointerEvents: 'none' as const, paddingVertical: s(4) }]}>
                            <Text style={[styles.flashLabelText, { color: theme.colors.textSecondary, fontSize: s(12) }]}>{flashText}</Text>
                        </Animated.View>
                    )}

                    {/* Inline popover — all platforms */}
                    {activePicker && (
                        <GlassSurface
                            tone="floating"
                            style={[
                                styles.popover,
                                {
                                    height: Math.min(
                                        Math.max(s(360), Math.floor(windowHeight * 0.42)),
                                        Math.max(s(320), Math.floor(windowHeight * 0.64) - safeArea.bottom),
                                    ),
                                    marginBottom: Math.max(s(18), safeArea.bottom + s(4)),
                                    borderRadius: s(12),
                                    paddingVertical: s(8),
                                    marginTop: s(8),
                                },
                            ]}
                        >
                            {pickerData ? (
                                <PickerContent {...pickerData} onSelect={handlePickerSelect} />
                            ) : null}
                        </GlassSurface>
                    )}
                    </View>
                </ScrollView>

                {/* Click-away backdrop */}
                {activePicker && (
                    <Pressable
                        accessible={false}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        tabIndex={-1}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }}
                        onPress={() => setActivePicker(null)}
                    />
                )}

                <View style={[styles.inputDock, { paddingHorizontal: s(12), gap: s(8) }]}>
                    {isSpawning && (
                        <View style={[
                            styles.creationStatus,
                            {
                                gap: s(10),
                                paddingHorizontal: s(12),
                                paddingVertical: s(10),
                            },
                        ]}>
                            <ActivityIndicator size="small" color={theme.colors.accent} />
                            <View style={styles.creationStatusText}>
                                <Text style={[styles.creationStatusTitle, { color: theme.colors.text, fontSize: s(13), lineHeight: s(17) }]} numberOfLines={1}>
                                    {t('newSession.creatingSession')}
                                </Text>
                                <Text style={[styles.creationStatusSubtitle, { color: theme.colors.textSecondary, fontSize: s(12), lineHeight: s(16) }]} numberOfLines={2}>
                                    {t('newSession.creatingSessionDescription')}
                                </Text>
                            </View>
                        </View>
                    )}
                    {/* Input box */}
                    <GlassSurface
                        tone="raised"
                        style={[
                            styles.inputBox,
                            {
                                borderRadius: Platform.select({ default: s(16), android: s(20) }),
                                paddingVertical: s(2),
                                paddingHorizontal: s(8),
                            },
                        ]}
                    >
                        <View style={[
                            styles.inputField,
                            {
                                paddingLeft: s(8),
                                paddingRight: s(4),
                                paddingVertical: s(4),
                                minHeight: s(40),
                                gap: s(8),
                            },
                        ]}>
                            <View style={{ flex: 1 }}>
                                <MultiTextInput
                                    ref={composerInputRef}
                                    value={prompt}
                                    onChangeText={setPrompt}
                                    placeholder={t('session.newSessionPlaceholder')}
                                    lineHeight={composerLineHeight}
                                    paddingTop={composerPaddingVertical}
                                    paddingBottom={composerPaddingVertical}
                                    maxHeight={s(240)}
                                    onKeyPress={handleKeyPress}
                                />
                            </View>
                            <View style={[
                                styles.sendButton,
                                canSend || isSpawning
                                    ? {
                                        backgroundColor: theme.colors.accent,
                                        borderColor: amberButtonVisuals.borderColor,
                                        shadowColor: amberButtonVisuals.shadowColor,
                                        shadowOpacity: theme.dark ? 0.34 : 0.24,
                                    }
                                    : styles.sendButtonInactive,
                                {
                                    width: sendButtonSize,
                                    height: sendButtonSize,
                                    borderRadius: sendButtonSize / 2,
                                    marginBottom: sendButtonMarginBottom,
                                },
                            ]}>
                                <Pressable
                                    style={(p) => [
                                        styles.sendButtonPressable,
                                        p.pressed && styles.sendButtonPressed,
                                    ]}
                                    disabled={!canSend}
                                    onPress={() => handleSend()}
                                    accessibilityRole="button"
                                    accessibilityLabel={isSpawning ? t('newSession.creatingSession') : t('newSession.title')}
                                    accessibilityState={{ disabled: !canSend, busy: isSpawning }}
                                >
                                    {(canSend || isSpawning) && (
                                        <>
                                            <LinearGradient
                                                colors={amberButtonVisuals.colors}
                                                start={{ x: 0.12, y: 0 }}
                                                end={{ x: 0.9, y: 1 }}
                                                style={styles.sendButtonGradient}
                                            />
                                            <View style={[
                                                styles.sendButtonHighlight,
                                                sendButtonHighlightGeometry.primary,
                                                {
                                                    backgroundColor: amberButtonVisuals.highlightColor,
                                                },
                                            ]} />
                                            <View style={[
                                                styles.sendButtonSecondaryHighlight,
                                                sendButtonHighlightGeometry.secondary,
                                                {
                                                    backgroundColor: amberButtonVisuals.secondaryHighlightColor,
                                                },
                                            ]} />
                                        </>
                                    )}
                                    {isSpawning ? (
                                        <ActivityIndicator
                                            size="small"
                                            color={theme.colors.button.primary.tint}
                                        />
                                    ) : (
                                        <Ionicons
                                            name={canSend ? 'paper-plane' : 'paper-plane-outline'}
                                            size={s(18)}
                                            color={theme.colors.button.primary.tint}
                                            style={styles.sendButtonIcon}
                                        />
                                    )}
                                </Pressable>
                            </View>
                        </View>
                    </GlassSurface>
                </View>

                <View style={{ height: Math.max(s(16), safeArea.bottom) }} />
            </View>
        </KeyboardAvoidingView>
    );
}

const WORKTREE_FIXED_ITEMS: PickerItem[] = [
    { key: '__none__', label: t('newSession.noWorktree') },
    { key: '__new__', label: t('newSession.newWorktree') },
];

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.canvas,
    },
    backgroundTexture: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
    backgroundSheen: {
        position: 'absolute',
        width: '58%',
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.56)',
        transform: [{ rotate: '-36deg' }],
    },
    inner: {
        flex: 1,
    },
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
    contentScroll: {
        flex: 1,
    },
    contentScrollContent: {
        paddingHorizontal: 12,
        paddingBottom: 18,
    },
    contentColumn: {
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        gap: 8,
    },
    inputDock: {
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 12,
        gap: 8,
    },
    configBox: {
        backgroundColor: theme.colors.glass.raised,
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(238, 248, 250, 0.18)' : theme.colors.glass.borderStrong,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingVertical: 10,
        paddingHorizontal: 10,
        overflow: 'hidden',
        shadowColor: theme.dark ? '#000' : theme.colors.glass.shadow,
        shadowOpacity: theme.dark ? 0.28 : 0.10,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
    },
    setupHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 4,
        paddingBottom: 8,
    },
    setupEyebrow: {
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 0,
        ...Typography.default('semiBold'),
    },
    setupTitle: {
        fontSize: 18,
        lineHeight: 23,
        ...Typography.default('semiBold'),
    },
    setupSubtitle: {
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
        ...Typography.default(),
    },
    setupGrid: {
        gap: 7,
    },
    setupCardPressable: {
        borderRadius: 14,
    },
    setupCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
    },
    setupCardCompact: {
        paddingVertical: 10,
        paddingHorizontal: 11,
        alignItems: 'center',
    },
    setupIcon: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    setupCardBody: {
        flex: 1,
        minWidth: 0,
    },
    setupCardTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    setupCardTitle: {
        flex: 1,
        minWidth: 0,
        fontSize: 14,
        lineHeight: 18,
        ...Typography.default('semiBold'),
    },
    setupCardDescription: {
        fontSize: 12,
        lineHeight: 17,
        marginTop: 3,
        ...Typography.default(),
    },
    setupCardValue: {
        fontSize: 14,
        lineHeight: 19,
        marginTop: 8,
        ...Typography.default('semiBold'),
    },
    setupCardValueCompact: {
        marginTop: 4,
        fontSize: 13,
        lineHeight: 17,
    },
    setupChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 7,
        marginTop: 6,
    },
    setupChip: {
        minHeight: MINIMUM_TAP_TARGET,
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.10)' : theme.colors.glass.border,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.075)' : theme.colors.accentSoft,
    },
    setupChipText: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 12,
        lineHeight: 16,
        ...Typography.default('semiBold'),
    },
    setupAgentIcon: {
        width: 14,
        height: 14,
    },
    advancedPanel: {
        marginTop: 9,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(238, 248, 250, 0.13)' : theme.colors.glass.border,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : theme.colors.glass.background,
        overflow: 'hidden',
    },
    advancedHeader: {
        minHeight: MINIMUM_TAP_TARGET,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    advancedTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        flex: 1,
        minWidth: 0,
    },
    advancedTitle: {
        fontSize: 13,
        lineHeight: 17,
        ...Typography.default('semiBold'),
    },
    advancedPillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 10,
        paddingBottom: 10,
        gap: 8,
    },
    advancedPill: {
        minHeight: MINIMUM_TAP_TARGET,
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.10)' : theme.colors.glass.border,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.075)' : theme.colors.accentSoft,
    },
    advancedPillText: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 12,
        lineHeight: 16,
        ...Typography.default('semiBold'),
    },
    advancedExpandedList: {
        gap: 7,
        paddingHorizontal: 8,
        paddingBottom: 8,
    },
    popover: {
        borderRadius: 12,
        paddingVertical: 8,
        marginTop: 8,
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255,255,255,0.12)' : theme.colors.divider,
        overflow: 'hidden',
        zIndex: 20,
        ...Platform.select({
            web: {
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
            },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 10,
                elevation: 8,
            },
        }),
    },
    configRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    configRowWithToggle: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    collapseToggle: {
        minWidth: MINIMUM_TAP_TARGET,
        minHeight: MINIMUM_TAP_TARGET,
        paddingHorizontal: 12,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    collapsedRow: {
        minHeight: MINIMUM_TAP_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    collapsedIconsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 4,
        paddingBottom: 8,
    },
    collapsedIconButton: {
        width: MINIMUM_TAP_TARGET,
        height: MINIMUM_TAP_TARGET,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    flashLabel: {
        alignSelf: 'center',
        paddingVertical: 4,
    },
    flashLabelText: {
        fontSize: 12,
        ...Typography.default(),
    },
    configRowPressed: {
        opacity: 0.6,
    },
    agentIcon: {
        width: 15,
        height: 15,
    },
    collapsedAgentIcon: {
        width: 14,
        height: 14,
    },
    configLabel: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    },
    creationStatus: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    creationStatusText: {
        flex: 1,
        minWidth: 0,
    },
    creationStatusTitle: {
        ...Typography.default('semiBold'),
    },
    creationStatusSubtitle: {
        ...Typography.default(),
    },
    inputBox: {
        backgroundColor: theme.colors.glass.raised,
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'hidden',
        paddingVertical: 2,
        paddingHorizontal: 8,
    },
    inputField: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingLeft: 8,
        paddingRight: 4,
        paddingVertical: 4,
        minHeight: 40,
        gap: 8,
    },
    sendButton: {
        width: COMPOSER_SEND_BUTTON_SIZE,
        height: COMPOSER_SEND_BUTTON_SIZE,
        borderRadius: COMPOSER_SEND_BUTTON_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginBottom: COMPOSER_SEND_BUTTON_MARGIN_BOTTOM,
        overflow: 'hidden',
        borderWidth: 1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 5,
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.glass.background,
        borderColor: theme.colors.glass.border,
    },
    sendButtonPressable: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    sendButtonPressed: {
        opacity: 0.78,
    },
    sendButtonGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    sendButtonHighlight: {
        position: 'absolute',
        borderRadius: 999,
    },
    sendButtonSecondaryHighlight: {
        position: 'absolute',
        borderRadius: 999,
    },
    sendButtonIcon: {
        transform: [{ translateX: -1 }, { translateY: 1 }],
    },
    offlineHelp: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    offlineHelpTitle: {
        fontSize: 13,
        ...Typography.default('semiBold'),
        marginBottom: 4,
    },
    offlineHelpText: {
        fontSize: 12,
        lineHeight: 18,
        ...Typography.default(),
    },
}));

// Bottom sheet styles

// Picker styles
const pickerStyles = {
    container: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    } as const,
    title: {
        fontSize: 18,
        paddingVertical: 12,
        paddingHorizontal: 4,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    titleRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
    },
    titleActions: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 8,
    },
    modeToggle: {
        flexDirection: 'row' as const,
        borderRadius: 10,
        padding: 2,
        gap: 2,
    },
    modeButton: {
        width: 30,
        height: 26,
        borderRadius: 8,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    doneButtonPressable: {
        width: 44,
        height: 44,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    doneButtonGlass: {
        width: 40,
        height: 36,
        borderRadius: 18,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        overflow: 'hidden' as const,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    searchRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 8,
    },
    searchInput: {
        minHeight: MINIMUM_TAP_TARGET,
        flex: 1,
        fontSize: 15,
        padding: 0,
        ...Typography.default(),
        ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }),
    } as const,
    pathInputRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 10,
        paddingHorizontal: 12,
        minHeight: 46,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
    },
    pathInputField: {
        flex: 1,
    } as const,
    pathTextInput: {
        fontSize: 16,
        minHeight: 44,
        paddingVertical: 0,
        ...Typography.default(),
        ...Platform.select({
            android: { textAlignVertical: 'center' as const },
            web: { outlineStyle: 'none' } as any,
            default: {},
        }),
    } as const,
    pathMetaText: {
        fontSize: 13,
        paddingHorizontal: 4,
        paddingBottom: 8,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    sectionLabel: {
        fontSize: 13,
        paddingHorizontal: 4,
        paddingBottom: 8,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    option: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
    },
    optionPressed: {
        opacity: 0.6,
    } as const,
    optionText: {
        fontSize: 15,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    divider: {
        height: 1,
        marginHorizontal: 12,
        marginVertical: 4,
    } as const,
    optionList: {
        flexGrow: 0,
        flexShrink: 1,
    } as const,
    emptyText: {
        fontSize: 14,
        textAlign: 'center' as const,
        paddingVertical: 20,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    offlineHint: {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingVertical: 32,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    offlineHintText: {
        fontSize: 14,
        textAlign: 'center' as const,
        ...Typography.default(),
    } as const,
};

export default React.memo(NewSessionScreen);
