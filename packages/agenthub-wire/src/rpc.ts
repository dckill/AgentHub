import { z } from 'zod';

export const RpcFailureSchema = z.object({
  __rpcError: z.object({
    code: z.enum(['INVALID_REQUEST', 'INVALID_RESPONSE', 'METHOD_NOT_FOUND', 'INTERNAL_ERROR']),
    message: z.string(),
  }),
});

export type RpcFailure = z.infer<typeof RpcFailureSchema>;

export function createRpcFailure(code: RpcFailure['__rpcError']['code'], message: string): RpcFailure {
  return { __rpcError: { code, message } };
}

export function parseRpcFailure(value: unknown): RpcFailure | undefined {
  const result = RpcFailureSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

const optionalError = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

const exactSemverSchema = z.string().regex(
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  'Expected an exact semantic version',
);

export const CliUpdateStatusSchema = z.object({
  phase: z.enum(['idle', 'checking', 'up-to-date', 'available', 'updating', 'restarting', 'failed', 'unsupported']),
  currentVersion: exactSemverSchema,
  latestVersion: exactSemverSchema.optional(),
  targetVersion: exactSemverSchema.optional(),
  updateAvailable: z.boolean(),
  canUpdate: z.boolean(),
  checkedAt: z.number().optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  error: z.string().max(4_096).optional(),
  unsupportedReason: z.string().max(4_096).optional(),
});

export type CliUpdateStatus = z.infer<typeof CliUpdateStatusSchema>;

const cliUpdateRequestResultSchema = z.object({
  accepted: z.boolean(),
  status: CliUpdateStatusSchema,
  message: z.string().optional(),
});

const spawnSessionResultSchema = z.union([
  z.object({ type: z.literal('success'), sessionId: z.string() }),
  z.object({ type: z.literal('requestToApproveDirectoryCreation'), directory: z.string() }),
  z.object({ type: z.literal('error'), errorMessage: z.string() }),
]);

const forkResultSchema = (idField: 'newClaudeSessionId' | 'newCodexThreadId') => z.union([
  z.object({ type: z.literal('success'), [idField]: z.string() }),
  z.object({ type: z.literal('error'), errorMessage: z.string() }),
]);

const rewindPointBaseSchema = z.object({ text: z.string(), timestamp: z.number() });
const claudeRewindPointSchema = rewindPointBaseSchema.extend({ uuid: z.string() });
const codexRewindPointSchema = rewindPointBaseSchema.extend({ itemId: z.string() });
const officialThreadSchema = z.object({
  id: z.string(),
  machineId: z.string(),
  cwd: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  createdAt: z.number().optional(),
  archived: z.boolean(),
  gitBranch: z.string().nullable().optional(),
  preview: z.string().optional(),
  provider: z.enum(['codex', 'claude']).optional(),
});

export const RpcCodexModelSchema = z.object({
  id: z.string(),
  model: z.string(),
  displayName: z.string(),
  description: z.string(),
  hidden: z.boolean(),
  isDefault: z.boolean(),
  supportedReasoningEfforts: z.array(z.object({
    reasoningEffort: z.string(),
    description: z.string(),
  })),
  defaultReasoningEffort: z.string(),
  serviceTiers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
  })).optional(),
});

export const RpcDirectoryEntrySchema = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory', 'other']),
  size: z.number().optional(),
  modified: z.number().optional(),
});

export const RpcTreeNodeSchema: z.ZodType<{
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  children?: Array<z.infer<typeof RpcTreeNodeSchema>>;
}> = z.lazy(() => z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  modified: z.number().optional(),
  children: z.array(RpcTreeNodeSchema).optional(),
}));

const commonRpcMethodSchemas = {
  'spawn-agenthub-session': {
    request: z.object({
      type: z.literal('spawn-in-directory').optional(),
      directory: z.string(),
      approvedNewDirectoryCreation: z.boolean().optional(),
      token: z.string().optional(),
      agent: z.enum(['claude', 'codex']).optional(),
      permissionMode: z.string().optional(),
      model: z.string().optional(),
      environmentVariables: z.record(z.string(), z.string()).optional(),
      resumeClaudeSessionId: z.string().optional(),
      resumeCodexThreadId: z.string().optional(),
      officialMirrorClaudeSessionId: z.string().optional(),
      officialMirrorCodexThreadId: z.string().optional(),
      parentSessionId: z.string().optional(),
      forkedFromMessageId: z.string().optional(),
    }),
    response: spawnSessionResultSchema,
  },
  'resume-agenthub-session': {
    request: z.object({
      sessionId: z.string(),
      model: z.string().optional(),
      permissionMode: z.string().optional(),
    }),
    response: spawnSessionResultSchema,
  },
  'claude-fork-session': {
    request: z.object({ directory: z.string(), claudeSessionId: z.string() }),
    response: forkResultSchema('newClaudeSessionId'),
  },
  'claude-list-rewind-points': {
    request: z.object({ directory: z.string(), claudeSessionId: z.string() }),
    response: z.union([
      z.object({ type: z.literal('success'), points: z.array(claudeRewindPointSchema) }),
      z.object({ type: z.literal('error'), errorMessage: z.string() }),
    ]),
  },
  'claude-duplicate-session': {
    request: z.object({ directory: z.string(), claudeSessionId: z.string(), cutAfterUuid: z.string() }),
    response: forkResultSchema('newClaudeSessionId'),
  },
  'codex-fork-thread': {
    request: z.object({ directory: z.string(), codexThreadId: z.string() }),
    response: forkResultSchema('newCodexThreadId'),
  },
  'codex-list-rewind-points': {
    request: z.object({ directory: z.string().optional(), codexThreadId: z.string() }),
    response: z.union([
      z.object({ type: z.literal('success'), points: z.array(codexRewindPointSchema) }),
      z.object({ type: z.literal('error'), errorMessage: z.string() }),
    ]),
  },
  'codex-duplicate-thread': {
    request: z.object({ directory: z.string(), codexThreadId: z.string(), cutAfterItemId: z.string() }),
    response: forkResultSchema('newCodexThreadId'),
  },
  'codex-list-models': {
    request: z.object({
      directory: z.string(),
      environmentVariables: z.record(z.string(), z.string()).optional(),
    }),
    response: z.object({
      models: z.array(RpcCodexModelSchema),
      fetchedAt: z.number(),
      stale: z.boolean(),
      cliVersion: z.string().optional(),
    }),
  },
  'codex-list-official-threads': {
    request: z.object({
      paths: z.array(z.string()).optional(),
      providers: z.array(z.enum(['codex', 'claude'])).optional(),
      limit: z.number().int().positive().optional(),
    }),
    response: z.object({ type: z.literal('success'), threads: z.array(officialThreadSchema) }),
  },
  'codex-list-official-thread-states': {
    request: z.object({ threadIds: z.array(z.string()) }),
    response: z.object({
      type: z.literal('success'),
      threadStates: z.array(z.object({ id: z.string(), archived: z.boolean() })),
    }),
  },
  'codex-list-ignored-official-threads': {
    request: z.object({}),
    response: z.object({ type: z.literal('success'), threadIds: z.array(z.string()) }),
  },
  'codex-ignore-official-thread': {
    request: z.object({ threadId: z.string() }),
    response: z.object({ type: z.literal('success') }),
  },
  'codex-unignore-official-thread': {
    request: z.object({ threadId: z.string() }),
    response: z.object({ type: z.literal('success') }),
  },
  abort: {
    request: z.object({ reason: z.string().optional() }),
    response: z.null(),
  },
  permission: {
    request: z.object({
      id: z.string(),
      approved: z.boolean(),
      reason: z.string().optional(),
      mode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan']).optional(),
      allowTools: z.array(z.string()).optional(),
      updatedInput: z.record(z.string(), z.unknown()).optional(),
      decision: z.enum(['approved', 'approved_for_session', 'denied', 'abort']).optional(),
    }),
    response: z.null(),
  },
  'permission-mode': {
    request: z.object({ mode: z.string() }),
    response: z.object({ applied: z.boolean() }),
  },
  switch: {
    request: z.object({ to: z.enum(['remote', 'local']) }),
    response: z.union([z.boolean(), z.null()]),
  },
  'goal-action': {
    request: z.object({
      action: z.enum(['clear', 'stop', 'edit']),
      objective: z.string().optional(),
    }),
    response: z.object({ ok: z.literal(true) }),
  },
  killSession: {
    request: z.object({}),
    response: z.object({ success: z.boolean(), message: z.string() }),
  },
  'stop-session': {
    request: z.object({ sessionId: z.string() }),
    response: z.object({
      message: z.string(),
      state: z.enum(['stopping', 'exited', 'timeout', 'not-found']),
    }),
  },
  'stop-daemon': {
    request: z.object({}),
    response: z.object({ message: z.string() }),
  },
  'check-cli-update': {
    request: z.object({}),
    response: CliUpdateStatusSchema,
  },
  'update-cli': {
    request: z.object({ version: exactSemverSchema.optional() }),
    response: cliUpdateRequestResultSchema,
  },
  'rollback-cli': {
    request: z.object({}),
    response: cliUpdateRequestResultSchema,
  },
  bash: {
    request: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      timeout: z.number().int().positive().optional(),
    }),
    response: optionalError.extend({
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      exitCode: z.number().int().optional(),
    }),
  },
  exec: {
    request: z.object({
      executable: z.string().min(1).max(4_096),
      args: z.array(z.string().max(65_536)).max(512),
      cwd: z.string().max(16_384).optional(),
      timeout: z.number().int().positive().max(300_000).optional(),
    }),
    response: optionalError.extend({
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      exitCode: z.number().int().optional(),
    }),
  },
  difftastic: {
    request: z.object({ args: z.array(z.string()), cwd: z.string().optional() }),
    response: optionalError.extend({
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      exitCode: z.number().int().optional(),
    }),
  },
  readFile: {
    request: z.object({
      path: z.string(),
      maxSize: z.number().int().nonnegative().optional(),
      offset: z.number().int().nonnegative().optional(),
      length: z.number().int().positive().optional(),
    }),
    response: optionalError.extend({
      content: z.string().optional(),
      totalSize: z.number().int().nonnegative().optional(),
      offset: z.number().int().nonnegative().optional(),
      bytesRead: z.number().int().nonnegative().optional(),
      truncated: z.boolean().optional(),
    }),
  },
  writeFile: {
    request: z.object({
      path: z.string(),
      content: z.string(),
      expectedHash: z.string().nullable().optional(),
    }),
    response: optionalError.extend({ hash: z.string().optional() }),
  },
  deleteFile: {
    request: z.object({ path: z.string() }),
    response: optionalError,
  },
  listDirectory: {
    request: z.object({ path: z.string() }),
    response: optionalError.extend({ entries: z.array(RpcDirectoryEntrySchema).optional() }),
  },
  createDirectory: {
    request: z.object({ path: z.string() }),
    response: optionalError,
  },
  getDirectoryTree: {
    request: z.object({ path: z.string(), maxDepth: z.number().int().nonnegative() }),
    response: optionalError.extend({ tree: RpcTreeNodeSchema.optional() }),
  },
  ripgrep: {
    request: z.object({ args: z.array(z.string()), cwd: z.string().optional() }),
    response: optionalError.extend({
      exitCode: z.number().int().optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
    }),
  },
} as const;

export type RpcMethodName = keyof typeof commonRpcMethodSchemas;
export type RpcRequestFor<M extends RpcMethodName> = z.infer<(typeof commonRpcMethodSchemas)[M]['request']>;
export type RpcResponseFor<M extends RpcMethodName> = z.infer<(typeof commonRpcMethodSchemas)[M]['response']>;
export const rpcMethodNames = Object.freeze(Object.keys(commonRpcMethodSchemas) as RpcMethodName[]);

export type RpcReadFileRequest = z.infer<(typeof commonRpcMethodSchemas)['readFile']['request']>;
export type RpcReadFileResponse = z.infer<(typeof commonRpcMethodSchemas)['readFile']['response']>;
export type RpcWriteFileRequest = z.infer<(typeof commonRpcMethodSchemas)['writeFile']['request']>;
export type RpcWriteFileResponse = z.infer<(typeof commonRpcMethodSchemas)['writeFile']['response']>;
export type RpcDeleteFileRequest = z.infer<(typeof commonRpcMethodSchemas)['deleteFile']['request']>;
export type RpcDeleteFileResponse = z.infer<(typeof commonRpcMethodSchemas)['deleteFile']['response']>;
export type RpcListDirectoryRequest = z.infer<(typeof commonRpcMethodSchemas)['listDirectory']['request']>;
export type RpcListDirectoryResponse = z.infer<(typeof commonRpcMethodSchemas)['listDirectory']['response']>;
export type RpcCreateDirectoryRequest = z.infer<(typeof commonRpcMethodSchemas)['createDirectory']['request']>;
export type RpcCreateDirectoryResponse = z.infer<(typeof commonRpcMethodSchemas)['createDirectory']['response']>;
export type RpcGetDirectoryTreeRequest = z.infer<(typeof commonRpcMethodSchemas)['getDirectoryTree']['request']>;
export type RpcGetDirectoryTreeResponse = z.infer<(typeof commonRpcMethodSchemas)['getDirectoryTree']['response']>;
export type RpcRipgrepRequest = z.infer<(typeof commonRpcMethodSchemas)['ripgrep']['request']>;
export type RpcRipgrepResponse = z.infer<(typeof commonRpcMethodSchemas)['ripgrep']['response']>;
export type RpcDirectoryEntry = z.infer<typeof RpcDirectoryEntrySchema>;
export type RpcTreeNode = z.infer<typeof RpcTreeNodeSchema>;
export type RpcSpawnSessionRequest = z.infer<(typeof commonRpcMethodSchemas)['spawn-agenthub-session']['request']>;
export type RpcSpawnSessionResult = z.infer<(typeof commonRpcMethodSchemas)['spawn-agenthub-session']['response']>;
export type RpcResumeSessionRequest = z.infer<(typeof commonRpcMethodSchemas)['resume-agenthub-session']['request']>;
export type RpcClaudeForkRequest = z.infer<(typeof commonRpcMethodSchemas)['claude-fork-session']['request']>;
export type RpcClaudeDuplicateRequest = z.infer<(typeof commonRpcMethodSchemas)['claude-duplicate-session']['request']>;
export type RpcClaudeForkResult = z.infer<(typeof commonRpcMethodSchemas)['claude-fork-session']['response']>;
export type RpcClaudeRewindPoint = z.infer<typeof claudeRewindPointSchema>;
export type RpcClaudeRewindResult = z.infer<(typeof commonRpcMethodSchemas)['claude-list-rewind-points']['response']>;
export type RpcCodexForkRequest = z.infer<(typeof commonRpcMethodSchemas)['codex-fork-thread']['request']>;
export type RpcCodexDuplicateRequest = z.infer<(typeof commonRpcMethodSchemas)['codex-duplicate-thread']['request']>;
export type RpcCodexForkResult = z.infer<(typeof commonRpcMethodSchemas)['codex-fork-thread']['response']>;
export type RpcCodexRewindPoint = z.infer<typeof codexRewindPointSchema>;
export type RpcCodexRewindResult = z.infer<(typeof commonRpcMethodSchemas)['codex-list-rewind-points']['response']>;
export type RpcCodexModel = z.infer<typeof RpcCodexModelSchema>;
export type RpcCodexModelsResult = z.infer<(typeof commonRpcMethodSchemas)['codex-list-models']['response']>;
export type RpcOfficialThread = z.infer<typeof officialThreadSchema>;
export type RpcOfficialThreadState = z.infer<(typeof commonRpcMethodSchemas)['codex-list-official-thread-states']['response']>['threadStates'][number];
export type RpcListOfficialThreadsRequest = z.infer<(typeof commonRpcMethodSchemas)['codex-list-official-threads']['request']>;
export type RpcListOfficialThreadsResult = z.infer<(typeof commonRpcMethodSchemas)['codex-list-official-threads']['response']>;

export type RpcMethodSchema = {
  request: z.ZodTypeAny;
  response: z.ZodTypeAny;
};

export function getRpcMethodSchema(method: string): RpcMethodSchema | undefined {
  return (commonRpcMethodSchemas as Record<string, RpcMethodSchema>)[method];
}

export function parseRpcRequest(method: string, value: unknown): unknown {
  return getRpcMethodSchema(method)?.request.parse(value) ?? value;
}

export function parseRpcResponse(method: string, value: unknown): unknown {
  return getRpcMethodSchema(method)?.response.parse(value) ?? value;
}
