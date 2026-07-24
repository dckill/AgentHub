import { describe, expect, it } from 'vitest';
import type { ProcessIdentity } from './processIdentity';
import { assessDaemonOwnership, hasDaemonStateOwnerChanged } from './daemonOwnership';

const identity: ProcessIdentity = {
  pid: 42, startMarker: '100', executablePath: '/usr/bin/node',
  commandDigest: 'a'.repeat(64), bootId: 'boot-1',
};

describe('daemon ownership assessment', () => {
  it('distinguishes confirmed owner, PID reuse and legacy unknown state', () => {
    expect(assessDaemonOwnership({ pid: 42, processIdentity: identity }, identity)).toBe('confirmed');
    expect(assessDaemonOwnership({ pid: 42, processIdentity: identity }, { ...identity, startMarker: '200' })).toBe('mismatch');
    expect(assessDaemonOwnership({ pid: 42 }, identity)).toBe('legacy-unknown');
    expect(assessDaemonOwnership({ pid: 42, processIdentity: identity }, null)).toBe('missing');
  });

  it('keeps the lock owner alive when persisted Windows identity fields drift', () => {
    expect(hasDaemonStateOwnerChanged(null, 'current-owner')).toBe(false);
    expect(hasDaemonStateOwnerChanged({
      ownerNonce: 'current-owner',
      processIdentity: { ...identity, startMarker: 'windows-cim-normalized' },
    }, 'current-owner')).toBe(false);
    expect(hasDaemonStateOwnerChanged({
      ownerNonce: 'replacement-owner',
      processIdentity: identity,
    }, 'current-owner')).toBe(true);
    expect(hasDaemonStateOwnerChanged({ processIdentity: identity }, 'current-owner')).toBe(true);
  });
});
