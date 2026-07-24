import { describe, expect, it, vi } from 'vitest';
import { registerRunnerSignalHandlers } from './processSignalHandlers';

describe('registerRunnerSignalHandlers', () => {
  it('registers SIGTERM/SIGINT and removes both listeners idempotently', async () => {
    const onSigterm = vi.fn();
    const onSigint = vi.fn();
    const beforeTerm = process.listenerCount('SIGTERM');
    const beforeInt = process.listenerCount('SIGINT');

    const dispose = registerRunnerSignalHandlers({ onSigterm, onSigint });

    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm + 1);
    expect(process.listenerCount('SIGINT')).toBe(beforeInt + 1);

    process.emit('SIGTERM');
    process.emit('SIGINT');
    expect(onSigterm).toHaveBeenCalledTimes(1);
    expect(onSigint).toHaveBeenCalledTimes(1);

    dispose();
    dispose();
    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
    expect(process.listenerCount('SIGINT')).toBe(beforeInt);
  });
});
