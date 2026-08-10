import type { AgentState, Metadata } from './sessionState';

/**
 * Representative persisted session records shared by Wire, App and CLI tests.
 * Keep this fixture free of runtime dependencies so it can model historical data.
 */
export const historicalMetadataSample = {
    path: '/workspace',
    host: 'laptop',
    homeDir: '/home/user',
    agentHubHomeDir: '/home/user/.agenthub',
    agentHubLibDir: '/home/user/.agenthub/lib',
    agentHubToolsDir: '/home/user/.agenthub/tools',
    models: [{
        code: 'gpt-5', value: 'GPT-5',
        supportedReasoningEfforts: [{ code: 'medium', value: 'Medium', description: null }],
    }],
    currentModelCode: 'gpt-5',
    operatingModes: [{ code: 'default', value: 'Default', description: null }],
    currentOperatingModeCode: 'default',
    sandbox: null,
    dangerouslySkipPermissions: false,
    lifecycleState: 'running',
    lifecycleStateSince: 1710000000000,
    officialMirror: { provider: 'codex', id: 'thread-1' },
} satisfies Metadata;

export const historicalAgentStateSample = {
    controlledByUser: false,
    requests: {
        'permission-1': {
            tool: 'Bash',
            arguments: { command: 'pwd' },
            createdAt: 1710000000000,
        },
    },
    completedRequests: {
        'permission-1': {
            tool: 'Bash',
            arguments: { command: 'pwd' },
            createdAt: 1710000000000,
            completedAt: 1710000001000,
            status: 'approved',
            mode: 'safe-yolo',
            allowTools: ['Bash', 'Read'],
            allowedTools: ['Bash', 'Read'],
            decision: 'approved',
        },
    },
    agentGoalStatus: {
        status: 'active',
        source: 'codex',
        observedAt: 1710000000000,
        sourceSessionId: 'thread-1',
        text: 'finish the task',
        capabilities: { clear: true, stop: false },
        progress: {
            currentStep: 1,
            totalSteps: 2,
            steps: [{ text: 'inspect', status: 'completed' }],
        },
    },
} satisfies AgentState;
