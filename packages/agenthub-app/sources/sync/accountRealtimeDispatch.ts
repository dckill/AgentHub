import type { ApiUpdate, ApiUpdateContainer } from './apiTypes';
import {
    handleUpdateAccountRealtime,
    type UpdateAccountRealtimeHandlerParams,
} from './updateAccountRealtimeHandler';

type AccountUpdate = Extract<ApiUpdate, { t: 'update-account' }>;

export type AccountRealtimeDispatchContext = {
    currentProfile: UpdateAccountRealtimeHandlerParams['currentProfile'];
    decryptSettings: UpdateAccountRealtimeHandlerParams['decryptSettings'];
    assertCurrent: UpdateAccountRealtimeHandlerParams['assertCurrent'];
    applyProfile: UpdateAccountRealtimeHandlerParams['applyProfile'];
    applySettings: UpdateAccountRealtimeHandlerParams['applySettings'];
    invalidateSettings: UpdateAccountRealtimeHandlerParams['invalidateSettings'];
    log: UpdateAccountRealtimeHandlerParams['log'];
    logError: UpdateAccountRealtimeHandlerParams['logError'];
    warn: UpdateAccountRealtimeHandlerParams['warn'];
    handleUpdateAccount?: typeof handleUpdateAccountRealtime;
};

/** Route account envelopes while leaving profile/settings semantics to the handler. */
export async function dispatchAccountRealtimeUpdate(
    envelope: ApiUpdateContainer,
    params: AccountRealtimeDispatchContext,
): Promise<boolean> {
    if (envelope.body.t !== 'update-account') {
        return false;
    }

    const accountUpdate = envelope.body as AccountUpdate;
    const handler = params.handleUpdateAccount ?? handleUpdateAccountRealtime;
    await handler({
        currentProfile: params.currentProfile,
        accountUpdate,
        timestamp: envelope.createdAt,
        decryptSettings: params.decryptSettings,
        assertCurrent: params.assertCurrent,
        applyProfile: params.applyProfile,
        applySettings: params.applySettings,
        invalidateSettings: params.invalidateSettings,
        log: params.log,
        logError: params.logError,
        warn: params.warn,
    });
    return true;
}
