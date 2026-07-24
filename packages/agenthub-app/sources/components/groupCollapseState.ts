export type CollapsibleGroup = {
    type: 'tool-group' | 'agent-work-group';
    id: string;
    hasPendingPermission: boolean;
    hasRunning: boolean;
};

export type GroupCollapseOverrides = {
    sessionId: string;
    values: ReadonlyMap<string, boolean>;
};

type GroupCandidate = {
    type: string;
    id?: string;
    hasPendingPermission?: boolean;
    hasRunning?: boolean;
};

export function resolveCollapsedGroupIds(
    items: readonly GroupCandidate[],
    overrides: GroupCollapseOverrides | null,
    sessionId: string,
): Set<string> {
    const values = overrides?.sessionId === sessionId ? overrides.values : null;
    const collapsed = new Set<string>();

    for (const item of items) {
        if ((item.type !== 'tool-group' && item.type !== 'agent-work-group') || !item.id) continue;
        const manual = values?.get(item.id);
        const shouldCollapse = manual ?? (!item.hasPendingPermission && !item.hasRunning);
        if (shouldCollapse) collapsed.add(item.id);
    }

    return collapsed;
}
