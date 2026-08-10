import { runSessionActionRequest } from './sessionActionRequestLifecycle';
import { sync } from './sync';

/**
 * Run a permission decision only while the account that opened the prompt is current.
 * A null result means the account changed before or during the RPC.
 */
export function runPermissionAction<T>(request: () => Promise<T>): Promise<T | null> {
    const generation = sync.getAccountGeneration();
    const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
    return runSessionActionRequest({ isCurrent, request });
}
