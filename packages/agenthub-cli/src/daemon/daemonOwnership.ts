import type { ProcessIdentity } from './processIdentity';
import { isSameProcessIdentity } from './processIdentity';

export type DaemonOwnership = 'confirmed' | 'mismatch' | 'missing' | 'legacy-unknown';

export function hasDaemonStateOwnerChanged(
  state: { ownerNonce?: string; processIdentity?: ProcessIdentity } | null,
  expectedOwnerNonce: string,
): boolean {
  if (!state) return false;
  return state.ownerNonce !== expectedOwnerNonce;
}

export function assessDaemonOwnership(
  state: { pid: number; processIdentity?: ProcessIdentity },
  actual: ProcessIdentity | null,
): DaemonOwnership {
  if (!state.processIdentity) return 'legacy-unknown';
  if (!actual) return 'missing';
  return isSameProcessIdentity(state.processIdentity, actual) ? 'confirmed' : 'mismatch';
}
