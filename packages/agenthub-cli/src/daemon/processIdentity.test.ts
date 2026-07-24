import { describe, expect, it } from 'vitest';
import {
  isSameProcessIdentity,
  normalizeWindowsStartMarker,
  readProcessIdentity,
} from './processIdentity';

describe('daemon process identity', () => {
  it('normalizes PowerShell CreationDate objects to a stable value', () => {
    expect(normalizeWindowsStartMarker('/Date(1784466612945)/')).toBe('/Date(1784466612945)/');
    expect(normalizeWindowsStartMarker({
      value: '/Date(1784466612945)/',
      DateTime: '2026年7月19日 21:10:12',
    })).toBe('/Date(1784466612945)/');
    expect(() => normalizeWindowsStartMarker({ DateTime: 'localized-only' })).toThrow(
      'Unable to normalize Windows process creation time',
    );
  });

  it('captures a live process identity and rejects PID reuse markers', async () => {
    const identity = await readProcessIdentity(process.pid);
    expect(identity).not.toBeNull();
    expect(identity?.pid).toBe(process.pid);
    expect(identity?.executablePath).toBeTruthy();
    expect(identity?.startMarker).toBeTruthy();
    expect(identity?.commandDigest).toMatch(/^[a-f0-9]{64}$/);

    expect(isSameProcessIdentity(identity!, { ...identity!, startMarker: `${identity!.startMarker}-reused` })).toBe(false);
    expect(isSameProcessIdentity(identity!, { ...identity!, executablePath: '/different/executable' })).toBe(false);
    expect(isSameProcessIdentity(identity!, { ...identity!, commandDigest: '0'.repeat(64) })).toBe(false);
    expect(isSameProcessIdentity(identity!, { ...identity!, bootId: 'different-boot' })).toBe(false);
    expect(isSameProcessIdentity(identity!, identity!)).toBe(true);
  });
});
