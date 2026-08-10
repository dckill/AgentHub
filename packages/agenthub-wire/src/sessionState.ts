import { z } from 'zod';

/**
 * Shared encrypted session metadata/state contract.
 *
 * This module intentionally contains schemas and inferred types only. It must
 * remain usable by the Expo App, CLI, Agent and Server without Node-only
 * dependencies. Fields that were historically required by only one client
 * are optional here so old App records and current CLI records can converge
 * without data loss.
 */

const ModelOptionSchema = z.object({
    code: z.string(),
    value: z.string(),
    description: z.string().nullish(),
    supportedReasoningEfforts: z.array(z.object({
        code: z.string(),
        value: z.string(),
        description: z.string().nullish(),
    })).optional(),
    defaultReasoningEffortCode: z.string().optional(),
    isDefault: z.boolean().optional(),
});

const CodeLabelSchema = z.object({
    code: z.string(),
    value: z.string(),
    description: z.string().nullish(),
});

export const MetadataSchema = z.object({
    models: z.array(ModelOptionSchema).optional(),
    currentModelCode: z.string().optional(),
    contextWindow: z.number().optional(),
    operatingModes: z.array(CodeLabelSchema).optional(),
    currentOperatingModeCode: z.string().optional(),
    thoughtLevels: z.array(CodeLabelSchema).optional(),
    currentThoughtLevelCode: z.string().optional(),
    path: z.string(),
    host: z.string(),
    version: z.string().optional(),
    name: z.string().optional(),
    os: z.string().optional(),
    summary: z.object({
        text: z.string(),
        updatedAt: z.number(),
    }).optional(),
    lastUserMessage: z.string().optional(),
    machineId: z.string().optional(),
    claudeSessionId: z.string().optional(),
    codexThreadId: z.string().optional(),
    officialMirror: z.object({
        provider: z.enum(['claude', 'codex']),
        id: z.string(),
    }).optional(),
    parentSessionId: z.string().optional(),
    forkedFromMessageId: z.string().optional(),
    isSideChat: z.boolean().optional(),
    tools: z.array(z.string()).optional(),
    slashCommands: z.array(z.string()).optional(),
    mcpServers: z.array(z.object({ name: z.string(), status: z.string() })).optional(),
    skills: z.array(z.string()).optional(),
    homeDir: z.string().optional(),
    agentHubHomeDir: z.string().optional(),
    agentHubLibDir: z.string().optional(),
    agentHubToolsDir: z.string().optional(),
    startedFromDaemon: z.boolean().optional(),
    hostPid: z.number().optional(),
    startedBy: z.enum(['daemon', 'terminal']).optional(),
    flavor: z.string().nullish(),
    sandbox: z.unknown().nullish(),
    dangerouslySkipPermissions: z.boolean().nullish(),
    lifecycleState: z.string().optional(),
    lifecycleStateSince: z.number().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export const AgentGoalSourceSchema = z.enum(['claude', 'codex']);

const AgentGoalProgressStepSchema = z.object({
    text: z.string().trim().min(1),
    status: z.enum(['pending', 'in_progress', 'completed']),
}).strict();

const AgentGoalProgressSchema = z.object({
    currentStep: z.number().int().positive().optional(),
    totalSteps: z.number().int().positive().optional(),
    steps: z.array(AgentGoalProgressStepSchema).optional(),
}).strict();

const AgentGoalCapabilitiesSchema = z.object({
    clear: z.boolean().optional(),
    stop: z.boolean().optional(),
    edit: z.boolean().optional(),
}).strict();

const AgentGoalStatusBaseSchema = z.object({
    source: AgentGoalSourceSchema,
    observedAt: z.number().int().nonnegative(),
    sourceSessionId: z.string().trim().min(1).optional(),
    sourceRevision: z.union([z.string().trim().min(1), z.number()]).optional(),
});

export const AgentGoalStatusSchema = z.discriminatedUnion('status', [
    AgentGoalStatusBaseSchema.extend({
        status: z.literal('unavailable'),
        reason: z.enum(['unsupported', 'not_loaded', 'stale', 'malformed', 'error', 'unknown']).optional(),
    }).strict(),
    AgentGoalStatusBaseSchema.extend({
        status: z.literal('inactive'),
        reason: z.enum(['none', 'cleared', 'completed', 'unknown']).optional(),
    }).strict(),
    AgentGoalStatusBaseSchema.extend({
        status: z.literal('active'),
        sourceSessionId: z.string().trim().min(1),
        text: z.string().trim().min(1),
        capabilities: AgentGoalCapabilitiesSchema.optional(),
        progress: AgentGoalProgressSchema.optional(),
    }).strict(),
]);

export type AgentGoalStatus = z.infer<typeof AgentGoalStatusSchema>;

const UsageLimitWindowSchema = z.object({
    id: z.string().trim().min(1),
    label: z.string().optional(),
    status: z.enum(['allowed', 'allowed_warning', 'rejected']).optional(),
    utilization: z.number().min(0).max(100).nullable().optional(),
    resetsAt: z.number().nonnegative().nullable().optional(),
}).strict();

const UsageLimitsSchema = z.object({
    capturedAt: z.number().nonnegative(),
    windows: z.array(UsageLimitWindowSchema),
}).strict();

const PermissionRequestSchema = z.object({
    tool: z.string(),
    arguments: z.unknown(),
    createdAt: z.number().nullish(),
});

const CompletedPermissionRequestSchema = z.object({
    tool: z.string(),
    arguments: z.unknown(),
    createdAt: z.number().nullish(),
    completedAt: z.number().nullish(),
    status: z.enum(['canceled', 'denied', 'approved']),
    reason: z.string().nullish(),
    mode: z.string().nullish(),
    allowTools: z.array(z.string()).nullish(),
    allowedTools: z.array(z.string()).nullish(),
    decision: z.enum(['approved', 'approved_for_session', 'denied', 'abort']).nullish(),
});

export const AgentStateSchema = z.object({
    controlledByUser: z.boolean().nullish(),
    usageLimits: UsageLimitsSchema.optional(),
    requests: z.record(PermissionRequestSchema).nullish(),
    completedRequests: z.record(CompletedPermissionRequestSchema).nullish(),
    agentGoalStatus: AgentGoalStatusSchema.optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;
