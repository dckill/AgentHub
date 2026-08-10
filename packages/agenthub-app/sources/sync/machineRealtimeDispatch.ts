import type { ApiUpdate, ApiUpdateContainer } from './apiTypes';
import type { Machine } from './storageTypes';
import {
    handleNewMachineRealtime,
    type NewMachineRealtimeHandlerParams,
} from './newMachineRealtimeHandler';
import {
    handleUpdateMachineRealtime,
    type UpdateMachineRealtimeHandlerParams,
} from './updateMachineRealtimeHandler';
import {
    handleDeleteMachineRealtime,
    type DeleteMachineRealtimeHandlerParams,
} from './deleteMachineRealtimeHandler';

type NewMachineUpdate = Extract<ApiUpdate, { t: 'new-machine' }>;
type UpdateMachineUpdate = Extract<ApiUpdate, { t: 'update-machine' }>;

export type MachineRealtimeDispatchContext = {
    getMachine: (machineId: string) => Machine | undefined;
    decryptDataEncryptionKey: NewMachineRealtimeHandlerParams['decryptDataEncryptionKey'];
    storeDataKey: NewMachineRealtimeHandlerParams['storeDataKey'];
    initializeMachines: NewMachineRealtimeHandlerParams['initializeMachines'];
    getMachineEncryption: (
        machineId: string,
    ) => UpdateMachineRealtimeHandlerParams['encryption'];
    assertCurrent: NewMachineRealtimeHandlerParams['assertCurrent'];
    invalidateMachines: NewMachineRealtimeHandlerParams['invalidateMachines'];
    applyMachine: NewMachineRealtimeHandlerParams['applyMachine'];
    hasMachine: (machineId: string) => boolean;
    deleteMachine: DeleteMachineRealtimeHandlerParams['deleteMachine'];
    removeMachineEncryption: DeleteMachineRealtimeHandlerParams['removeMachineEncryption'];
    deleteDataKey: DeleteMachineRealtimeHandlerParams['deleteDataKey'];
    log: DeleteMachineRealtimeHandlerParams['log'];
    logError: NewMachineRealtimeHandlerParams['logError'];
    handleNewMachine?: typeof handleNewMachineRealtime;
    handleUpdateMachine?: typeof handleUpdateMachineRealtime;
    handleDeleteMachine?: typeof handleDeleteMachineRealtime;
};

/** Route machine envelopes while leaving decryption and recovery to handlers. */
export async function dispatchMachineRealtimeUpdate(
    envelope: ApiUpdateContainer,
    params: MachineRealtimeDispatchContext,
): Promise<boolean> {
    const body = envelope.body;

    if (body.t === 'new-machine') {
        const handler = params.handleNewMachine ?? handleNewMachineRealtime;
        await handler({
            existing: params.getMachine(body.machineId),
            update: body as NewMachineUpdate,
            decryptDataEncryptionKey: params.decryptDataEncryptionKey,
            storeDataKey: params.storeDataKey,
            initializeMachines: params.initializeMachines,
            getMachineEncryption: () => params.getMachineEncryption(body.machineId),
            assertCurrent: params.assertCurrent,
            invalidateMachines: params.invalidateMachines,
            applyMachine: params.applyMachine,
            logError: params.logError,
        });
        return true;
    }

    if (body.t === 'update-machine') {
        const machineId = body.machineId;
        const handler = params.handleUpdateMachine ?? handleUpdateMachineRealtime;
        await handler({
            machineId,
            existing: params.getMachine(machineId),
            update: body as UpdateMachineUpdate,
            seq: envelope.seq,
            createdAt: envelope.createdAt,
            encryption: params.getMachineEncryption(machineId),
            assertCurrent: params.assertCurrent,
            invalidateMachines: params.invalidateMachines,
            applyMachine: params.applyMachine,
            logError: params.logError,
        });
        return true;
    }

    if (body.t === 'delete-machine') {
        const handler = params.handleDeleteMachine ?? handleDeleteMachineRealtime;
        handler({
            machineId: body.machineId,
            hasMachine: params.hasMachine(body.machineId),
            deleteMachine: params.deleteMachine,
            removeMachineEncryption: params.removeMachineEncryption,
            deleteDataKey: params.deleteDataKey,
            log: params.log,
        });
        return true;
    }

    return false;
}
