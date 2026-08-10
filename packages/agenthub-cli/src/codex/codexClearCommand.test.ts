import { describe, expect, it, vi } from 'vitest';
import { enqueueCodexUserText, isCodexClearText } from './codexClearCommand';

describe('Codex clear command routing', () => {
  it('recognizes only an isolated /clear command', () => {
    expect(isCodexClearText('  /clear  ')).toBe(true);
    expect(isCodexClearText('/clear now')).toBe(false);
  });

  it('clears pending prompts and queues /clear in isolation', () => {
    const queue = { push: vi.fn(), pushIsolateAndClear: vi.fn() };
    const mode = { permissionMode: 'default' as const };

    expect(enqueueCodexUserText({ text: ' /clear ', mode, queue })).toBe('clear');
    expect(queue.pushIsolateAndClear).toHaveBeenCalledWith(' /clear ', mode);
    expect(queue.push).not.toHaveBeenCalled();
  });
});
