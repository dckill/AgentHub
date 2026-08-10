import { describe, expect, it, vi } from 'vitest';
import { CodexPermissionHandler } from '../utils/permissionHandler';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

function createSessionMock(initialState: Record<string, any> = {}) {
    let state: Record<string, any> = initialState;

    return {
        session: {
            rpcHandlerManager: {
                registerHandler: vi.fn(),
            },
            updateAgentState: vi.fn((updater: (currentState: Record<string, any>) => Record<string, any>) => {
                state = updater(state);
                return state;
            }),
        },
        getState: () => state,
    };
}

describe('CodexPermissionHandler', () => {
    it('cancels permission requests orphaned by a previous CLI process with an explicit reason', () => {
        const { session, getState } = createSessionMock({
            requests: {
                stale: {
                    tool: 'Bash',
                    arguments: { command: 'pwd' },
                    createdAt: 1000,
                },
            },
        });
        const handler = new CodexPermissionHandler(session as any);

        handler.reset('Previous CLI process exited before responding');

        expect(getState().requests).toEqual({});
        expect(getState().completedRequests.stale).toMatchObject({
            status: 'canceled',
            reason: 'Previous CLI process exited before responding',
        });
    });

    it('auto-approves the safe change_title tool', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'call_change_title_123',
            'change_title',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
        expect(getState().completedRequests.call_change_title_123).toMatchObject({
            tool: 'change_title',
            arguments: { title: 'Greeting' },
            status: 'approved',
            decision: 'approved',
        });
    });

    it('keeps non-safe tools pending for user approval', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_exec_123',
            'Bash',
            { command: 'pwd' },
        );

        expect(getState().requests.call_exec_123).toMatchObject({
            tool: 'Bash',
            arguments: { command: 'pwd' },
        });

        handler.abortAll();

        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('notifies when a non-safe tool needs permission', async () => {
        const { session } = createSessionMock();
        const notifyPermissionRequest = vi.fn();
        const handler = new CodexPermissionHandler(session as any, {
            notifyPermissionRequest,
            provider: 'codex',
        });

        const pending = handler.handleToolCall(
            'call_exec_123',
            'Bash',
            { command: 'pwd' },
        );

        expect(notifyPermissionRequest).toHaveBeenCalledWith({
            toolCallId: 'call_exec_123',
            toolName: 'Bash',
            input: { command: 'pwd' },
            provider: 'codex',
        });

        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('does not notify for auto-approved tools', async () => {
        const { session } = createSessionMock();
        const notifyPermissionRequest = vi.fn();
        const handler = new CodexPermissionHandler(session as any, {
            notifyPermissionRequest,
            provider: 'codex',
        });

        await handler.handleToolCall(
            'call_change_title_123',
            'change_title',
            { title: 'Greeting' },
        );

        expect(notifyPermissionRequest).not.toHaveBeenCalled();
    });

    it('does NOT auto-approve a crafted tool name containing change_title as substring', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_malicious_1',
            'change_title_and_run_command',
            { title: 'pwn', cmd: 'rm -rf /' },
        );

        // Should remain pending (not auto-approved) — resolve via abort to clean up.
        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('does NOT auto-approve a tool whose ID merely contains change_title as substring', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        // ID like `x_change_title_y` — old substring check would match, new prefix check must not.
        const pending = handler.handleToolCall(
            'x_change_title_y',
            'ExecCommand',
            { command: 'rm -rf /' },
        );

        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('auto-approves change_title tool call by timestamped ID', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'change_title-1765385846663',
            'other',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
    });
});
