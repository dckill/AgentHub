import { describe, expect, it, vi } from 'vitest';
import { PermissionHandler } from './permissionHandler';

function createSessionMock() {
  let state: Record<string, any> = {
    requests: {
      stale: {
        tool: 'Write',
        arguments: { file_path: '/tmp/example' },
        createdAt: 1000,
      },
    },
  };
  return {
    session: {
      client: {
        rpcHandlerManager: { registerHandler: vi.fn() },
        updateAgentState: vi.fn((updater: (current: Record<string, any>) => Record<string, any>) => {
          state = updater(state);
          return state;
        }),
      },
    },
    getState: () => state,
  };
}

describe('Claude PermissionHandler reset', () => {
  it('records why an orphaned request can no longer be answered', () => {
    const { session, getState } = createSessionMock();
    const handler = new PermissionHandler(session as any);

    handler.reset('Previous CLI process exited before responding');

    expect(getState().requests).toEqual({});
    expect(getState().completedRequests.stale).toMatchObject({
      status: 'canceled',
      reason: 'Previous CLI process exited before responding',
    });
  });
});
