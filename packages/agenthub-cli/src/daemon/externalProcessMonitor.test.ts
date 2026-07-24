import { describe, expect, it, vi } from 'vitest';
import {
  parseLinuxProcessState,
  probeExternalProcessState,
} from './externalProcessMonitor';

describe('external process monitor', () => {
  it('parses Linux process state after the final command-name parenthesis', () => {
    expect(parseLinuxProcessState('123 (runner with ) parenthesis) Z 1 2 3')).toBe('Z');
    expect(parseLinuxProcessState('123 (runner) S 1 2 3')).toBe('S');
    expect(parseLinuxProcessState('invalid')).toBeNull();
  });

  it('treats Linux zombie and dead states as exited', async () => {
    const signalProcess = vi.fn();

    await expect(probeExternalProcessState(123, {
      platform: 'linux',
      signalProcess,
      readLinuxStat: vi.fn().mockResolvedValue('123 (runner) Z 1 2 3'),
    })).resolves.toBe('exited');
    await expect(probeExternalProcessState(124, {
      platform: 'linux',
      signalProcess,
      readLinuxStat: vi.fn().mockResolvedValue('124 (runner) X 1 2 3'),
    })).resolves.toBe('exited');
  });

  it('keeps a live process running and treats ESRCH or a missing proc entry as exited', async () => {
    await expect(probeExternalProcessState(123, {
      platform: 'linux',
      signalProcess: vi.fn(),
      readLinuxStat: vi.fn().mockResolvedValue('123 (runner) S 1 2 3'),
    })).resolves.toBe('running');

    await expect(probeExternalProcessState(124, {
      platform: 'linux',
      signalProcess: vi.fn(() => {
        throw Object.assign(new Error('missing'), { code: 'ESRCH' });
      }),
      readLinuxStat: vi.fn(),
    })).resolves.toBe('exited');

    await expect(probeExternalProcessState(125, {
      platform: 'linux',
      signalProcess: vi.fn(),
      readLinuxStat: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    })).resolves.toBe('exited');
  });

  it('fails safe when the Linux proc state cannot be read or parsed', async () => {
    await expect(probeExternalProcessState(123, {
      platform: 'linux',
      signalProcess: vi.fn(),
      readLinuxStat: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' })),
    })).resolves.toBe('running');
    await expect(probeExternalProcessState(124, {
      platform: 'linux',
      signalProcess: vi.fn(),
      readLinuxStat: vi.fn().mockResolvedValue('invalid'),
    })).resolves.toBe('running');
  });
});
