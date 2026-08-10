import type { ApiUpdateContainer } from './apiTypes';
import {
    dispatchNewMessageRealtimeUpdate,
    type NewMessageRealtimeDispatchContext,
} from './newMessageRealtimeDispatch';
import {
    dispatchSessionRealtimeUpdate,
    type SessionRealtimeDispatchContext,
} from './sessionRealtimeDispatch';
import {
    dispatchAccountRealtimeUpdate,
    type AccountRealtimeDispatchContext,
} from './accountRealtimeDispatch';
import {
    dispatchMachineRealtimeUpdate,
    type MachineRealtimeDispatchContext,
} from './machineRealtimeDispatch';
import {
    dispatchArtifactRealtimeUpdate,
    type ArtifactRealtimeDispatchContext,
} from './artifactRealtimeDispatch';

export type RealtimeUpdateDispatchParams = {
    envelope: ApiUpdateContainer;
    message: NewMessageRealtimeDispatchContext;
    session: SessionRealtimeDispatchContext;
    account: AccountRealtimeDispatchContext;
    machine: MachineRealtimeDispatchContext;
    artifact: ArtifactRealtimeDispatchContext;
    dispatchNewMessage?: typeof dispatchNewMessageRealtimeUpdate;
    dispatchSession?: typeof dispatchSessionRealtimeUpdate;
    dispatchAccount?: typeof dispatchAccountRealtimeUpdate;
    dispatchMachine?: typeof dispatchMachineRealtimeUpdate;
    dispatchArtifact?: typeof dispatchArtifactRealtimeUpdate;
};

/** Apply realtime updates in protocol priority order and stop after one branch handles them. */
export async function dispatchRealtimeUpdate(params: RealtimeUpdateDispatchParams): Promise<void> {
    const dispatchNewMessage = params.dispatchNewMessage ?? dispatchNewMessageRealtimeUpdate;
    if (await dispatchNewMessage(params.envelope, params.message)) return;

    const dispatchSession = params.dispatchSession ?? dispatchSessionRealtimeUpdate;
    if (await dispatchSession(params.envelope, params.session)) return;

    const dispatchAccount = params.dispatchAccount ?? dispatchAccountRealtimeUpdate;
    if (await dispatchAccount(params.envelope, params.account)) return;

    const dispatchMachine = params.dispatchMachine ?? dispatchMachineRealtimeUpdate;
    if (await dispatchMachine(params.envelope, params.machine)) return;

    const dispatchArtifact = params.dispatchArtifact ?? dispatchArtifactRealtimeUpdate;
    await dispatchArtifact(params.envelope, params.artifact);
}
