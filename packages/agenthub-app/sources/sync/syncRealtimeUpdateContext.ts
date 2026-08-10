import type { RealtimeUpdateLifecycleOptions } from './realtimeUpdateLifecycle';

type MessageContext = RealtimeUpdateLifecycleOptions['message'];
type SessionContext = RealtimeUpdateLifecycleOptions['session'];
type AccountContext = RealtimeUpdateLifecycleOptions['account'];
type MachineContext = RealtimeUpdateLifecycleOptions['machine'];
type ArtifactContext = RealtimeUpdateLifecycleOptions['artifact'];

export type SyncRealtimeUpdateContextBindings = {
    generation: number;
    assertCurrent: (generation: number) => void;
    message: Omit<MessageContext, 'assertCurrent'>;
    session: Omit<SessionContext, 'assertCurrent'>;
    account: Omit<AccountContext, 'assertCurrent'>;
    machine: Omit<MachineContext, 'assertCurrent'>;
    artifact: Omit<ArtifactContext, 'assertCurrent'>;
};

export type SyncRealtimeUpdateContexts = Pick<
    RealtimeUpdateLifecycleOptions,
    'message' | 'session' | 'account' | 'machine' | 'artifact'
>;

/**
 * Bind the current account generation once and expose it to every realtime
 * branch. The branch-specific adapters remain injectable, while no caller can
 * accidentally forget the generation gate for one resource type.
 */
export function createSyncRealtimeUpdateContexts(
    bindings: SyncRealtimeUpdateContextBindings,
): SyncRealtimeUpdateContexts {
    const assertCurrent = () => bindings.assertCurrent(bindings.generation);
    return {
        message: { ...bindings.message, assertCurrent },
        session: { ...bindings.session, assertCurrent },
        account: { ...bindings.account, assertCurrent },
        machine: { ...bindings.machine, assertCurrent },
        artifact: { ...bindings.artifact, assertCurrent },
    };
}
