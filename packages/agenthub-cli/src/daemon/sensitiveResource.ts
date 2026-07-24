export interface TerminalEventSource {
  on(event: 'exit' | 'error', listener: (...args: any[]) => void): unknown;
}

export function bindSensitiveCleanupToChild(child: TerminalEventSource, cleanup?: () => void): () => void {
  let cleaned = false;
  const cleanupOnce = () => {
    if (cleaned) return;
    cleaned = true;
    cleanup?.();
  };
  child.on('exit', cleanupOnce);
  child.on('error', cleanupOnce);
  return cleanupOnce;
}
