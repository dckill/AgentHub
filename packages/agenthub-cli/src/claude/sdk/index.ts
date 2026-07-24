/**
 * Claude Code SDK integration for AgentHub CLI
 * Uses the separately installed Claude Code CLI through its stream-json protocol.
 */

export { query } from './query'
export { AbortError } from './types'
export type {
    QueryOptions,
    QueryPrompt,
    SDKMessage,
    SDKUserMessage,
    SDKAssistantMessage,
    SDKSystemMessage,
    SDKResultMessage,
    CanCallToolCallback,
    PermissionResult
} from './types'
export type { Query } from './types'
