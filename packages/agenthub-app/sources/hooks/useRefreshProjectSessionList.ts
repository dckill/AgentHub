import * as React from 'react';
import { useAllMachines, useProjectListViewData } from '@/sync/storage';
import { refreshProjectSessionList } from '@/sync/sessionListRefresh';
import { sync } from '@/sync/sync';

export function useRefreshProjectSessionList() {
    const projectItems = useProjectListViewData();
    const machines = useAllMachines({ includeOffline: true });
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const inFlightRefresh = React.useRef<Promise<void> | null>(null);

    const refreshProjectSessions = React.useCallback(async () => {
        if (inFlightRefresh.current) {
            return inFlightRefresh.current;
        }

        const refreshPromise = (async () => {
            setIsRefreshing(true);
            const generation = sync.getAccountGeneration();
            try {
                if (generation === null) {
                    return;
                }
                await refreshProjectSessionList({
                    projectItems,
                    machines,
                    isCurrent: () => sync.getAccountGeneration() === generation,
                });
            } finally {
                setIsRefreshing(false);
                inFlightRefresh.current = null;
            }
        })();

        inFlightRefresh.current = refreshPromise;
        return refreshPromise;
    }, [machines, projectItems]);

    return {
        isRefreshing,
        refreshProjectSessions,
    };
}
