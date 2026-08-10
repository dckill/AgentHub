import { z } from "zod";
import {
    AgentStateSchema as SharedAgentStateSchema,
    MetadataSchema as SharedMetadataSchema,
    type AgentState as SharedAgentState,
    type Metadata as SharedMetadata,
} from "@artsum/agenthub-wire";

//
// Agent states
//

export const MetadataSchema = SharedMetadataSchema;
export type Metadata = SharedMetadata;

export const AgentGoalSourceSchema = z.enum(['claude', 'codex']);

export const AgentGoalProgressStepSchema = z.object({
    text: z.string().trim().min(1),
    status: z.enum(['pending', 'in_progress', 'completed']),
}).strict();

export const AgentGoalProgressSchema = z.object({
    currentStep: z.number().int().positive().optional(),
    totalSteps: z.number().int().positive().optional(),
    steps: z.array(AgentGoalProgressStepSchema).optional(),
}).strict();

export const AgentGoalCapabilitiesSchema = z.object({
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

export const UsageLimitWindowSchema = z.object({
    id: z.string().trim().min(1),
    label: z.string().optional(),
    status: z.enum(['allowed', 'allowed_warning', 'rejected']).optional(),
    utilization: z.number().min(0).max(100).nullable().optional(),
    resetsAt: z.number().nonnegative().nullable().optional(),
}).strict();

export const UsageLimitsSchema = z.object({
    capturedAt: z.number().nonnegative(),
    windows: z.array(UsageLimitWindowSchema),
}).strict();

export const AgentStateSchema = SharedAgentStateSchema;
export type AgentState = SharedAgentState;

export const TodoItemSchema = z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    id: z.string().optional(),
});

export const TodoItemsSchema = z.array(TodoItemSchema);

export type TodoItem = z.infer<typeof TodoItemSchema>;

export interface Session {
    id: string,
    seq: number,
    createdAt: number,
    updatedAt: number,
    active: boolean,
    activeAt: number,
    metadata: Metadata | null,
    metadataVersion: number,
    agentState: AgentState | null,
    agentStateVersion: number,
    thinking: boolean,
    thinkingAt: number,
    presence: "online" | number, // "online" when active, timestamp when last seen
    todos?: TodoItem[];
    draft?: string | null; // Local draft message, not synced to server
    permissionMode?: string | null; // Local permission mode key, not synced to server
    modelMode?: string | null; // Local model key, not synced to server
    effortLevel?: string | null; // Local effort level key, not synced to server
    // IMPORTANT: latestUsage is extracted from reducerState.latestUsage after message processing.
    // We store it directly on Session to ensure it's available immediately on load.
    // Do NOT store reducerState itself on Session - it's mutable and should only exist in SessionMessages.
    latestUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreation: number;
        cacheRead: number;
        contextSize: number;
        contextWindow?: number;
        timestamp: number;
    } | null;
}

export interface DecryptedMessage {
    id: string,
    seq: number | null,
    localId: string | null,
    content: any,
    createdAt: number,
}

//
// Machine states
//

export const MachineMetadataSchema = z.object({
    host: z.string(),
    platform: z.string(),
    agentHubCliVersion: z.string(),
    agentHubHomeDir: z.string(), // Directory for AgentHub auth, settings, logs (usually .agenthub/ or .agenthub-dev/)
    homeDir: z.string(), // User's home directory (matches CLI field name)
    // Optional fields that may be added in future versions
    username: z.string().optional(),
    arch: z.string().optional(),
    displayName: z.string().optional(), // Custom display name for the machine
    // Daemon status fields
    daemonLastKnownStatus: z.enum(['running', 'shutting-down']).optional(),
    daemonLastKnownPid: z.number().optional(),
    shutdownRequestedAt: z.number().optional(),
    shutdownSource: z.enum(['agenthub-app', 'agenthub-cli', 'os-signal', 'unknown']).optional(),
    cliAvailability: z.object({
        claude: z.boolean(),
        codex: z.boolean(),
        detectedAt: z.number(),
    }).optional(),
    resumeSupport: z.object({
        rpcAvailable: z.boolean(),
        requiresSameMachine: z.boolean(),
        requiresAgentHubAgentAuth: z.boolean(),
        agenthubAgentAuthenticated: z.boolean(),
        detectedAt: z.number(),
    }).optional(),
    localCredentialStatus: z.object({
        claude: z.boolean(),
        codex: z.boolean(),
        detectedAt: z.number(),
    }).optional(),
});

export type MachineMetadata = z.infer<typeof MachineMetadataSchema>;

export interface Machine {
    id: string;
    seq: number;
    createdAt: number;
    updatedAt: number;
    active: boolean;
    activeAt: number;  // Changed from lastActiveAt to activeAt for consistency
    metadata: MachineMetadata | null;
    metadataVersion: number;
    daemonState: any | null;  // Dynamic daemon state (runtime info)
    daemonStateVersion: number;
}

//
// Git Status
//

export interface GitStatus {
    branch: string | null;
    isDirty: boolean;
    modifiedCount: number;
    untrackedCount: number;
    stagedCount: number;
    lastUpdatedAt: number;
    // Line change statistics - separated by staged vs unstaged
    stagedLinesAdded: number;
    stagedLinesRemoved: number;
    unstagedLinesAdded: number;
    unstagedLinesRemoved: number;
    // Computed totals
    linesAdded: number;      // stagedLinesAdded + unstagedLinesAdded
    linesRemoved: number;    // stagedLinesRemoved + unstagedLinesRemoved
    linesChanged: number;    // Total lines that were modified (added + removed)
    // Branch tracking information (from porcelain v2)
    upstreamBranch?: string | null; // Name of upstream branch
    aheadCount?: number; // Commits ahead of upstream
    behindCount?: number; // Commits behind upstream
    stashCount?: number; // Number of stash entries
}
