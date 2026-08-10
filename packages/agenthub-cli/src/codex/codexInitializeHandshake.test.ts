import { describe, expect, it, vi } from 'vitest';
import { initializeCodexAppServer } from './codexInitializeHandshake';

describe('initializeCodexAppServer', () => {
  it('completes initialize before announcing connected state', async () => {
    const order: string[] = [];
    const request = vi.fn(async (method: string, params: unknown) => {
      order.push(`request:${method}`);
      expect(params).toEqual({
        clientInfo: {
          name: 'agenthub-codex',
          title: 'AgentHub Codex Client',
          version: '1.2.3',
        },
        capabilities: { experimentalApi: true },
      });
    });
    const notify = vi.fn((method: string) => order.push(`notify:${method}`));
    const setConnected = vi.fn(() => order.push('connected'));
    const logConnected = vi.fn(() => order.push('logged'));

    await initializeCodexAppServer({
      version: '1.2.3',
      request,
      notify,
      setConnected,
      logConnected,
    });

    expect(order).toEqual(['request:initialize', 'notify:initialized', 'connected', 'logged']);
  });

  it('does not announce connected state when initialize fails', async () => {
    const error = new Error('handshake failed');
    const request = vi.fn(async () => { throw error; });
    const notify = vi.fn();
    const setConnected = vi.fn();
    const logConnected = vi.fn();

    await expect(initializeCodexAppServer({
      version: '1.2.3',
      request,
      notify,
      setConnected,
      logConnected,
    })).rejects.toBe(error);
    expect(notify).not.toHaveBeenCalled();
    expect(setConnected).not.toHaveBeenCalled();
    expect(logConnected).not.toHaveBeenCalled();
  });
});
