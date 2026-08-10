import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClaudeLocal, mockCreateSessionScanner } = vi.hoisted(() => ({
  mockClaudeLocal: vi.fn(),
  mockCreateSessionScanner: vi.fn(),
}));

vi.mock('./claudeLocal', () => ({
  claudeLocal: mockClaudeLocal,
  ExitCodeError: class ExitCodeError extends Error {
    constructor(public exitCode: number) {
      super(`Process exited with code: ${exitCode}`);
    }
  },
}));
vi.mock('./utils/sessionScanner', () => ({ createSessionScanner: mockCreateSessionScanner }));
vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));

import { claudeLocalLauncher } from './claudeLocalLauncher';

describe('claudeLocalLauncher launch failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSessionScanner.mockResolvedValue({
      onNewSession: vi.fn(),
      cleanup: vi.fn(async () => {}),
    });
  });

  it('delivers a safe actionable launch failure to the App before retrying', async () => {
    const failure = new Error('Native CLI binary missing');
    mockClaudeLocal.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const session = {
      sessionId: 'claude-session',
      path: '/tmp/project',
      client: {
        sendClaudeSessionMessage: vi.fn(),
        closeClaudeSessionTurn: vi.fn(),
        sendSessionEvent: vi.fn(),
        rpcHandlerManager: { registerHandler: vi.fn() },
      },
      queue: {
        reset: vi.fn(),
        setOnMessage: vi.fn(),
        size: vi.fn(() => 0),
      },
      addSessionFoundCallback: vi.fn(),
      removeSessionFoundCallback: vi.fn(),
      onAbort: vi.fn(),
      onSessionFound: vi.fn(),
      onThinkingChange: vi.fn(),
      consumeOneTimeFlags: vi.fn(),
      claudeEnvVars: undefined,
      claudeArgs: undefined,
      mcpServers: {},
      allowedTools: [],
      hookSettingsPath: '/tmp/hook-settings.json',
      sandboxConfig: undefined,
    };

    await expect(claudeLocalLauncher(session as any)).resolves.toEqual({ type: 'exit', code: 0 });
    expect(session.client.sendSessionEvent).toHaveBeenCalledWith({
      type: 'message',
      message: 'Process exited unexpectedly: Native CLI binary missing',
    });
  });
});
