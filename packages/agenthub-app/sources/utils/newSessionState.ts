import type { NewSessionAgentType } from '@/sync/persistence';
import { CLIENT_AGENT_LABELS } from '@/sync/agentTypes';

export type NewSessionAgentOption = {
    key: NewSessionAgentType;
    label: string;
};

export type NewSessionAgentAvailability = Partial<Record<NewSessionAgentType, boolean>> & {
    detectedAt?: number;
};

export type NewSessionConfigItemKey = 'machine' | 'path' | 'agent' | 'permission' | 'credential' | 'worktree';

export type NewSessionConfigItem = {
    key: NewSessionConfigItemKey;
    title: string;
    description: string;
    value: string;
    tone: 'default' | 'warning';
    priority: 'primary' | 'advanced';
};

export type NewSessionConfigItemInput = {
    machineName: string;
    machineOnline: boolean;
    pathName: string;
    agentLabel: string;
    modelName?: string | null;
    effortName?: string | null;
    permissionName?: string | null;
    credentialLabel?: string | null;
    worktreeLabel?: string | null;
    showModel?: boolean;
    showEffort?: boolean;
    showPermission?: boolean;
    showCredential?: boolean;
    showWorktree?: boolean;
    translate?: (key: NewSessionSetupCopyKey) => string;
};

export type NewSessionSetupCopyKey =
    | 'newSession.setup.machine.title'
    | 'newSession.setup.machine.description'
    | 'newSession.setup.machineOffline.description'
    | 'newSession.setup.path.title'
    | 'newSession.setup.path.description'
    | 'newSession.setup.agent.title'
    | 'newSession.setup.agent.description'
    | 'newSession.setup.permission.title'
    | 'newSession.setup.permission.description'
    | 'newSession.setup.credential.title'
    | 'newSession.setup.credential.description'
    | 'newSession.setup.worktree.title'
    | 'newSession.setup.worktree.description';

const DEFAULT_SETUP_COPY: Record<NewSessionSetupCopyKey, string> = {
    'newSession.setup.machine.title': 'Device',
    'newSession.setup.machine.description': 'Where AgentHub will start this session.',
    'newSession.setup.machineOffline.description': 'This device is offline. Choose an online device before starting.',
    'newSession.setup.path.title': 'Working folder',
    'newSession.setup.path.description': 'The project folder used as the starting context.',
    'newSession.setup.agent.title': 'Agent and model',
    'newSession.setup.agent.description': 'Choose the CLI agent and the model profile for this conversation.',
    'newSession.setup.permission.title': 'Permission mode',
    'newSession.setup.permission.description': 'Controls whether the agent asks before reading, editing, or running commands.',
    'newSession.setup.credential.title': 'Credentials',
    'newSession.setup.credential.description': 'Use credentials from the host device or a saved API credential.',
    'newSession.setup.worktree.title': 'Git worktree',
    'newSession.setup.worktree.description': 'Start in the current folder, an existing worktree, or create a new one.',
};

function getSetupCopy(
    translate: ((key: NewSessionSetupCopyKey) => string) | undefined,
    key: NewSessionSetupCopyKey,
): string {
    return translate?.(key) ?? DEFAULT_SETUP_COPY[key];
}

export const ALL_NEW_SESSION_AGENTS: NewSessionAgentOption[] = [
    { key: 'claude', label: CLIENT_AGENT_LABELS.claude.toLowerCase() },
    { key: 'codex', label: CLIENT_AGENT_LABELS.codex.toLowerCase() },
];

export function getAvailableNewSessionAgents(
    availability: NewSessionAgentAvailability | null | undefined,
): NewSessionAgentOption[] {
    if (!availability) {
        return ALL_NEW_SESSION_AGENTS;
    }

    const available = ALL_NEW_SESSION_AGENTS.filter(agent => availability[agent.key]);
    return available.length > 0 ? available : ALL_NEW_SESSION_AGENTS;
}

/**
 * Revalidates a persisted agent selection against the selected machine at the
 * moment a session is launched. Missing or inconclusive capability metadata
 * keeps the persisted value for backward compatibility with older daemons.
 */
export function resolveNewSessionAgent(
    selectedAgent: NewSessionAgentType,
    availability: NewSessionAgentAvailability | null | undefined,
): NewSessionAgentType {
    if (!availability || availability[selectedAgent] !== false) {
        return selectedAgent;
    }

    return ALL_NEW_SESSION_AGENTS.find((agent) => availability[agent.key] === true)?.key ?? selectedAgent;
}

export function getNextNewSessionAgentKey(
    agents: NewSessionAgentOption[],
    currentAgent: NewSessionAgentType,
): NewSessionAgentType {
    const choices = agents.length > 0 ? agents : ALL_NEW_SESSION_AGENTS;
    const index = choices.findIndex(agent => agent.key === currentAgent);
    return choices[(index + 1) % choices.length].key;
}

/** Picks an online machine for first-use drafts, retaining existing order as fallback. */
export function getInitialMachineId(
    machines: ReadonlyArray<{ id: string; active: boolean }>,
): string | null {
    return machines.find(machine => machine.active)?.id ?? machines[0]?.id ?? null;
}

/** Resolves a persisted semantic mode key against the current runtime options. */
export function resolveModeSelection<T extends { key: string }>(
    options: ReadonlyArray<T>,
    draftKey: string | null | undefined,
    defaultKey: string,
): T | null {
    if (options.length === 0) {
        return null;
    }

    return options.find(option => option.key === draftKey)
        ?? options.find(option => option.key === defaultKey)
        ?? options[0];
}

export function shouldClearSelectedCredential(
    credentials: Array<{ id: string; agent: NewSessionAgentType }>,
    selectedCredentialId: string | null,
    selectedAgent: NewSessionAgentType,
): boolean {
    if (!selectedCredentialId) {
        return false;
    }

    const selectedCredential = credentials.find(credential => credential.id === selectedCredentialId);
    return !selectedCredential || selectedCredential.agent !== selectedAgent;
}

export function shouldShowCredentialSelectorRow(
    _credentials: Array<{ id: string; agent: NewSessionAgentType }>,
    _selectedAgent: NewSessionAgentType,
): boolean {
    return true;
}

export function getNewSessionConfigItems(input: NewSessionConfigItemInput): NewSessionConfigItem[] {
    const copy = (key: NewSessionSetupCopyKey) => getSetupCopy(input.translate, key);
    const agentDetails = [
        input.showModel ? input.modelName : null,
        input.showEffort ? input.effortName : null,
    ].filter((part): part is string => !!part && part.trim().length > 0);

    const items: NewSessionConfigItem[] = [
        {
            key: 'machine',
            title: copy('newSession.setup.machine.title'),
            description: input.machineOnline
                ? copy('newSession.setup.machine.description')
                : copy('newSession.setup.machineOffline.description'),
            value: input.machineName,
            tone: input.machineOnline ? 'default' : 'warning',
            priority: 'primary',
        },
        {
            key: 'path',
            title: copy('newSession.setup.path.title'),
            description: copy('newSession.setup.path.description'),
            value: input.pathName,
            tone: 'default',
            priority: 'primary',
        },
        {
            key: 'agent',
            title: copy('newSession.setup.agent.title'),
            description: copy('newSession.setup.agent.description'),
            value: agentDetails.length > 0
                ? `${input.agentLabel} · ${agentDetails.join(' · ')}`
                : input.agentLabel,
            tone: 'default',
            priority: 'primary',
        },
    ];

    if (input.showPermission && input.permissionName) {
        items.push({
            key: 'permission',
            title: copy('newSession.setup.permission.title'),
            description: copy('newSession.setup.permission.description'),
            value: input.permissionName,
            tone: 'default',
            priority: 'advanced',
        });
    }

    if (input.showCredential && input.credentialLabel) {
        items.push({
            key: 'credential',
            title: copy('newSession.setup.credential.title'),
            description: copy('newSession.setup.credential.description'),
            value: input.credentialLabel,
            tone: 'default',
            priority: 'advanced',
        });
    }

    if (input.showWorktree && input.worktreeLabel) {
        items.push({
            key: 'worktree',
            title: copy('newSession.setup.worktree.title'),
            description: copy('newSession.setup.worktree.description'),
            value: input.worktreeLabel,
            tone: 'default',
            priority: 'advanced',
        });
    }

    return items;
}
