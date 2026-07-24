import { describe, expect, it } from 'vitest';
import {
  buildPerformancePlaintextMessages,
  parsePerformanceFixtureArgs,
} from './performanceSessionFixture';

describe('authenticated performance session fixture', () => {
  it('builds deterministic, valid user messages without embedding credentials', () => {
    const messages = buildPerformancePlaintextMessages('session-1', 3, 'performance message');

    expect(messages).toEqual([
      { localId: 'perf-session-1-1', content: { role: 'user', content: { type: 'text', text: 'performance message 1' }, meta: { sentFrom: 'performance-fixture' } } },
      { localId: 'perf-session-1-2', content: { role: 'user', content: { type: 'text', text: 'performance message 2' }, meta: { sentFrom: 'performance-fixture' } } },
      { localId: 'perf-session-1-3', content: { role: 'user', content: { type: 'text', text: 'performance message 3' }, meta: { sentFrom: 'performance-fixture' } } },
    ]);
    expect(JSON.stringify(messages)).not.toMatch(/token|secret|encryptionKey/i);
  });

  it('rejects missing ids, invalid counts, and counts above the 10k gate', () => {
    expect(() => parsePerformanceFixtureArgs([])).toThrow('session id');
    expect(() => parsePerformanceFixtureArgs(['--session', 's', '--count', '0'])).toThrow('1..10000');
    expect(() => parsePerformanceFixtureArgs(['--session', 's', '--count', '10001'])).toThrow('1..10000');
    expect(parsePerformanceFixtureArgs(['--session', 's', '--count', '10000', '--prefix', 'bench'])).toEqual({
      sessionId: 's',
      count: 10000,
      prefix: 'bench',
    });
  });
});
