import type { InitializeParams } from './codexAppServerTypes';

export type CodexInitializeHandshakeOptions = {
  version: string;
  request: (method: 'initialize', params: InitializeParams) => Promise<unknown>;
  notify: (method: 'initialized') => void;
  setConnected: () => void;
  logConnected: () => void;
};

/** Complete the app-server initialize handshake before exposing the client as connected. */
export async function initializeCodexAppServer(
  options: CodexInitializeHandshakeOptions,
): Promise<void> {
  const initParams: InitializeParams = {
    clientInfo: {
      name: 'agenthub-codex',
      title: 'AgentHub Codex Client',
      version: options.version,
    },
    capabilities: {
      experimentalApi: true,
    },
  };
  await options.request('initialize', initParams);
  options.notify('initialized');
  options.setConnected();
  options.logConnected();
}
