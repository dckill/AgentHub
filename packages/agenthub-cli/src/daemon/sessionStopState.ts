export type SessionLifecycleState = 'running' | 'stopping' | 'exited' | 'timeout';
export type StopSessionState = Exclude<SessionLifecycleState, 'running'> | 'not-found';
export type StopSessionResult = {
  success: boolean;
  state: StopSessionState;
};

type TerminalStopState = Exclude<StopSessionState, 'not-found'>;

type TerminalStopRecord = {
  state: TerminalStopState;
  expiresAt: number;
};

export class SessionStopStateRegistry {
  private readonly records = new Map<string, TerminalStopRecord>();
  private readonly retentionMs: number;
  private readonly now: () => number;

  constructor(options: { retentionMs: number; now?: () => number }) {
    if (!Number.isFinite(options.retentionMs) || options.retentionMs <= 0) {
      throw new Error('retentionMs must be a positive finite number');
    }
    this.retentionMs = options.retentionMs;
    this.now = options.now ?? Date.now;
  }

  record(sessionId: string, state: TerminalStopState): void {
    this.records.set(sessionId, {
      state,
      expiresAt: this.now() + this.retentionMs,
    });
  }

  get(sessionId: string): TerminalStopState | undefined {
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    if (record.expiresAt <= this.now()) {
      this.records.delete(sessionId);
      return undefined;
    }
    return record.state;
  }
}

export function requestSessionStop(state: SessionLifecycleState): {
  state: SessionLifecycleState;
  shouldSignal: boolean;
} {
  if (state === 'running') {
    return { state: 'stopping', shouldSignal: true };
  }
  return { state, shouldSignal: false };
}

export function markSessionExited(state: SessionLifecycleState): SessionLifecycleState {
  return state === 'exited' || state === 'timeout' ? state : 'exited';
}

export function markSessionTimeout(state: SessionLifecycleState): SessionLifecycleState {
  return state === 'exited' || state === 'timeout' ? state : 'timeout';
}
