export type MachinesViewSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MachinesViewState = 'loading' | 'connecting' | 'offline' | 'empty' | 'ready';

export function buildMachinesViewModel(input: {
    dataReady: boolean;
    socketStatus: MachinesViewSocketStatus;
    visibleMachineCount: number;
}): { state: MachinesViewState; showMachineList: boolean } {
    const showMachineList = input.dataReady && input.visibleMachineCount > 0;
    if (!input.dataReady) return { state: 'loading', showMachineList: false };
    if (input.socketStatus === 'connecting') return { state: 'connecting', showMachineList };
    if (input.socketStatus === 'disconnected' || input.socketStatus === 'error') {
        return { state: 'offline', showMachineList };
    }
    if (!showMachineList) return { state: 'empty', showMachineList: false };
    return { state: 'ready', showMachineList: true };
}
