export type HomeOverviewSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type HomeOverviewState =
    | 'loading'
    | 'connecting'
    | 'offline'
    | 'empty'
    | 'no-online-devices'
    | 'ready';

export type HomeOverviewMachineInput = {
    id: string;
    online: boolean;
};

export type HomeOverviewSessionInput = {
    id: string;
    updatedAt: number;
    active: boolean;
    title: string | null;
};

export type HomeOverviewModel = {
    state: HomeOverviewState;
    totalMachineCount: number;
    onlineMachineCount: number;
    activeSessionCount: number;
    canStartSession: boolean;
    recentWork: HomeOverviewSessionInput[];
};

export function buildHomeOverviewModel(input: {
    dataReady: boolean;
    socketStatus: HomeOverviewSocketStatus;
    machines: HomeOverviewMachineInput[];
    sessions: HomeOverviewSessionInput[];
}): HomeOverviewModel {
    const totalMachineCount = input.machines.length;
    const onlineMachineCount = input.machines.filter((machine) => machine.online).length;
    const activeSessionCount = input.sessions.filter((session) => session.active).length;
    const recentWork = [...input.sessions]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 3);

    let state: HomeOverviewState;
    if (!input.dataReady) {
        state = 'loading';
    } else if (input.socketStatus === 'connecting') {
        state = 'connecting';
    } else if (input.socketStatus === 'disconnected' || input.socketStatus === 'error') {
        state = 'offline';
    } else if (totalMachineCount === 0) {
        state = 'empty';
    } else if (onlineMachineCount === 0) {
        state = 'no-online-devices';
    } else {
        state = 'ready';
    }

    return {
        state,
        totalMachineCount,
        onlineMachineCount,
        activeSessionCount,
        canStartSession: state === 'ready',
        recentWork,
    };
}
