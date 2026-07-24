import { z } from 'zod'
import { CliUpdateStatusSchema, MessageMetaSchema, type MessageMeta } from '@artsum/agenthub-wire';
import type { Update, UpdateMachineBody } from '@artsum/agenthub-wire';
import { UsageSchema } from '@/claude/types'
import type { SandboxConfig } from '@/persistence'

export {
  MessageMetaSchema,
  SessionMessageContentSchema,
  SessionMessageSchema,
  UpdateBodySchema,
  UpdateMachineBodySchema,
  UpdateSchema,
  UpdateSessionBodySchema,
} from '@artsum/agenthub-wire';
export type {
  MessageMeta,
  SessionMessage,
  SessionMessageContent,
  Update,
  UpdateBody,
  UpdateMachineBody,
  UpdateSessionBody,
} from '@artsum/agenthub-wire';

/**
 * Permission mode type - includes both Claude and Codex modes
 * Known built-in modes. MessageMeta transport remains string-extensible for forward compatibility;
 * each runner validates and maps supported values before execution.
 *
 * Claude modes: default, acceptEdits, bypassPermissions, plan
 * Codex modes: read-only, safe-yolo, yolo
 *
 * When calling Claude Code, Codex modes are mapped at the transport boundary:
 * - yolo → bypassPermissions
 * - safe-yolo → default
 * - read-only → default
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'read-only' | 'safe-yolo' | 'yolo'

/**
 * Usage data type from Claude
 */
export type Usage = z.infer<typeof UsageSchema>

/**
 * Socket events from server to client
 */
export interface ServerToClientEvents {
  update: (data: Update) => void
  'rpc-request': (data: { method: string, params: string }, callback: (response: string) => void) => void
  'rpc-registered': (data: { method: string }) => void
  'rpc-unregistered': (data: { method: string }) => void
  'rpc-error': (data: { type: string, error: string }) => void
  ephemeral: (data: { type: 'activity', id: string, active: boolean, activeAt: number, thinking: boolean }) => void
  auth: (data: { success: boolean, user: string }) => void
  error: (data: { message: string }) => void
}


/**
 * Socket events from client to server
 */
export interface ClientToServerEvents {
  message: (data: { sid: string, message: any }) => void
  'session-alive': (data: {
    sid: string;
    time: number;
    thinking: boolean;
    mode?: 'local' | 'remote';
  }) => void
  'session-end': (
    data: { sid: string, time: number },
    callback?: (response: { result: 'success' | 'error' }) => void,
  ) => void,
  'update-metadata': (data: { sid: string, expectedVersion: number, metadata: string }, cb: (answer: {
    result: 'error'
  } | {
    result: 'version-mismatch'
    version: number,
    metadata: string
  } | {
    result: 'success',
    version: number,
    metadata: string
  }) => void) => void,
  'update-state': (data: { sid: string, expectedVersion: number, agentState: string | null }, cb: (answer: {
    result: 'error'
  } | {
    result: 'version-mismatch'
    version: number,
    agentState: string | null
  } | {
    result: 'success',
    version: number,
    agentState: string | null
  }) => void) => void,
  'ping': (callback: () => void) => void
  'rpc-register': (data: { method: string }) => void
  'rpc-unregister': (data: { method: string }) => void
  'rpc-call': (data: { method: string, params: string }, callback: (response: {
    ok: boolean
    result?: string
    error?: string
  }) => void) => void
  'usage-report': (data: {
    key: string
    sessionId: string
    model?: string | null
    tokens: {
      total: number
      context?: number
      context_window?: number
      [key: string]: number | undefined
    }
    cost: {
      total: number
      [key: string]: number
    }
  }) => void
}

/**
 * Session information
 */
export type Session = {
  id: string,
  seq: number,
  encryptionKey: Uint8Array;
  encryptionVariant: 'legacy' | 'dataKey';
  metadata: Metadata,
  metadataVersion: number,
  agentState: AgentState | null,
  agentStateVersion: number,
}

/**
 * Machine metadata - static information (rarely changes)
 */
export const MachineMetadataSchema = z.object({
  host: z.string(),
  platform: z.string(),
  agentHubCliVersion: z.string(),
  homeDir: z.string(),
  agentHubHomeDir: z.string(),
  agentHubLibDir: z.string(),
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
})

export type MachineMetadata = z.infer<typeof MachineMetadataSchema>

/**
 * Daemon state - dynamic runtime information (frequently updated)
 */
export const DaemonStateSchema = z.object({
  status: z.union([
    z.enum(['running', 'shutting-down']),
    z.string() // Forward compatibility
  ]),
  pid: z.number().optional(),
  httpPort: z.number().optional(),
  startedAt: z.number().optional(),
  shutdownRequestedAt: z.number().optional(),
  shutdownSource:
    z.union([
      z.enum(['mobile-app', 'cli', 'os-signal', 'unknown']),
      z.string() // Forward compatibility
    ]).optional(),
  startedWithCliVersion: z.string().optional(),
  cliUpdate: CliUpdateStatusSchema.optional(),
})

export type DaemonState = z.infer<typeof DaemonStateSchema>

export type Machine = {
  id: string,
  encryptionKey: Uint8Array;
  encryptionVariant: 'legacy' | 'dataKey';
  metadata: MachineMetadata,
  metadataVersion: number,
  daemonState: DaemonState | null,
  daemonStateVersion: number,
}

/**
 * API response types
 */
export const CreateSessionResponseSchema = z.object({
  session: z.object({
    id: z.string(),
    tag: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    metadata: z.string(),
    metadataVersion: z.number(),
    agentState: z.string().nullable(),
    agentStateVersion: z.number()
  })
})

export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.object({
    type: z.literal('text'),
    text: z.string()
  }),
  localKey: z.string().optional(), // Mobile messages include this
  meta: MessageMetaSchema.optional()
})

export type UserMessage = z.infer<typeof UserMessageSchema>

export const AgentMessageSchema = z.object({
  role: z.literal('agent'),
  content: z.object({
    type: z.literal('output'),
    data: z.any()
  }),
  meta: MessageMetaSchema.optional()
})

export type AgentMessage = z.infer<typeof AgentMessageSchema>

export const MessageContentSchema = z.union([UserMessageSchema, AgentMessageSchema])

export type MessageContent = z.infer<typeof MessageContentSchema>

export type Metadata = {
  /**
   * Session config option value normalized for UI metadata consumers.
   */
  // `code` = protocol value ID, `value` = human label
  models?: Array<{
    code: string;
    value: string;
    description?: string | null;
    supportedReasoningEfforts?: Array<{ code: string; value: string; description?: string | null }>;
    defaultReasoningEffortCode?: string;
    isDefault?: boolean;
  }>,
  currentModelCode?: string,
  contextWindow?: number,
  operatingModes?: Array<{ code: string; value: string; description?: string | null }>,
  currentOperatingModeCode?: string,
  thoughtLevels?: Array<{ code: string; value: string; description?: string | null }>,
  currentThoughtLevelCode?: string,
  path: string,
  host: string,
  version?: string,
  name?: string,
  os?: string,
  summary?: {
    text: string,
    updatedAt: number
  },
  lastUserMessage?: string,
  machineId?: string,
  claudeSessionId?: string, // Claude Code session ID
  codexThreadId?: string, // Codex app-server thread ID
  officialMirror?: { provider: 'claude' | 'codex'; id: string },
  parentSessionId?: string, // AgentHub session this session was forked from
  forkedFromMessageId?: string, // AgentHub message used as the fork point
  tools?: string[],
  slashCommands?: string[],
  mcpServers?: Array<{ name: string; status: string }>,
  skills?: string[],
  homeDir: string,
  agentHubHomeDir: string,
  agentHubLibDir: string,
  agentHubToolsDir: string,
  startedFromDaemon?: boolean,
  hostPid?: number,
  startedBy?: 'daemon' | 'terminal',
  // Lifecycle state management
  lifecycleState?: 'running' | 'archiveRequested' | 'archived' | string,
  lifecycleStateSince?: number,
  archivedBy?: string,
  archiveReason?: string,
  flavor?: string
  sandbox?: SandboxConfig | null
  dangerouslySkipPermissions?: boolean | null
};

export type AgentGoalStatus = {
  source: 'claude' | 'codex',
  observedAt: number,
  sourceSessionId?: string,
  sourceRevision?: string | number,
} & (
  | {
      status: 'unavailable',
      reason?: 'unsupported' | 'not_loaded' | 'stale' | 'malformed' | 'error' | 'unknown',
    }
  | {
      status: 'inactive',
      reason?: 'none' | 'cleared' | 'completed' | 'unknown',
    }
  | {
      status: 'active',
      sourceSessionId: string,
      text: string,
      capabilities?: {
        clear?: boolean,
        stop?: boolean,
        edit?: boolean,
      },
      progress?: {
        currentStep?: number,
        totalSteps?: number,
        steps?: Array<{
          text: string,
          status: 'pending' | 'in_progress' | 'completed',
        }>,
      },
    }
);

export type AgentState = {
  controlledByUser?: boolean | null | undefined
  requests?: {
    [id: string]: {
      tool: string,
      arguments: any,
      createdAt: number
    }
  }
  completedRequests?: {
    [id: string]: {
      tool: string,
      arguments: any,
      createdAt: number,
      completedAt: number,
      status: 'canceled' | 'denied' | 'approved',
      reason?: string,
      mode?: PermissionMode,
      decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
      allowTools?: string[]
    }
  }
  agentGoalStatus?: AgentGoalStatus
}
