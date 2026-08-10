import type { ApiEphemeralUpdate } from './apiTypes';

export type EphemeralUpdateDispatch = {
    activity: boolean;
    machineActivity: boolean;
    usage: boolean;
    sessionControl: boolean;
};

const emptyDispatch = (): EphemeralUpdateDispatch => ({
    activity: false,
    machineActivity: false,
    usage: false,
    sessionControl: false,
});

export function buildEphemeralUpdateDispatch(update: ApiEphemeralUpdate): EphemeralUpdateDispatch {
    const dispatch = emptyDispatch();
    switch (update.type) {
        case 'activity':
            dispatch.activity = true;
            break;
        case 'machine-activity':
            dispatch.machineActivity = true;
            break;
        case 'usage':
            dispatch.usage = true;
            break;
        case 'session-control':
            dispatch.sessionControl = true;
            break;
    }
    return dispatch;
}
