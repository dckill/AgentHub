import { describe, expect, it } from 'vitest';
import {
  markSessionExited,
  markSessionTimeout,
  requestSessionStop,
  SessionStopStateRegistry,
} from './sessionStopState';

describe('daemon session stop state', () => {
  it('moves running to stopping and signals only once', () => {
    expect(requestSessionStop('running')).toEqual({ state: 'stopping', shouldSignal: true });
    expect(requestSessionStop('stopping')).toEqual({ state: 'stopping', shouldSignal: false });
  });

  it('records terminal exited and timeout states without allowing restart', () => {
    expect(markSessionExited('stopping')).toBe('exited');
    expect(markSessionTimeout('stopping')).toBe('timeout');
    expect(requestSessionStop('exited')).toEqual({ state: 'exited', shouldSignal: false });
    expect(requestSessionStop('timeout')).toEqual({ state: 'timeout', shouldSignal: false });
  });

  it('keeps terminal stop results queryable for a bounded retention window', () => {
    let now = 1_000;
    const registry = new SessionStopStateRegistry({ retentionMs: 100, now: () => now });

    registry.record('session-exited', 'exited');
    registry.record('session-timeout', 'timeout');

    expect(registry.get('session-exited')).toBe('exited');
    expect(registry.get('session-timeout')).toBe('timeout');

    now += 101;
    expect(registry.get('session-exited')).toBeUndefined();
    expect(registry.get('session-timeout')).toBeUndefined();
  });
});
