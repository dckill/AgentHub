import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { bindSensitiveCleanupToChild } from './sensitiveResource';

describe('sensitive child resource lifecycle', () => {
  it('cleans exactly once across exit and error terminal events', () => {
    const child = new EventEmitter();
    const cleanup = vi.fn();
    bindSensitiveCleanupToChild(child, cleanup);

    child.emit('exit', 0, null);
    child.emit('error', new Error('late duplicate event'));

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
