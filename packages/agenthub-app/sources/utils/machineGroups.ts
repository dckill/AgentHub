export const UNGROUPED_MACHINE_GROUP_KEY = '__ungrouped__';
export const NEW_MACHINE_GROUP_KEY = '__new__';

export interface MachineGroup {
    name: string;
    machineIds: string[];
}

export interface MachineGroupPickerOption {
    key: string;
    label: string;
    selected: boolean;
}

export function getOrderedMachineGroupNames(groupsMap: Record<string, string>, groupOrder: string[]): string[] {
    const orderedNames: string[] = [];
    const seen = new Set<string>();

    for (const name of groupOrder) {
        const trimmed = name.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        orderedNames.push(trimmed);
        seen.add(trimmed);
    }

    const assignedNames = [...new Set(Object.values(groupsMap).map(name => name.trim()).filter(Boolean))].sort();
    for (const name of assignedNames) {
        if (seen.has(name)) continue;
        orderedNames.push(name);
        seen.add(name);
    }

    return orderedNames;
}

export function buildMachineGroups(machineIds: string[], groupsMap: Record<string, string>, groupOrder: string[]): MachineGroup[] {
    const result: MachineGroup[] = [];

    for (const name of getOrderedMachineGroupNames(groupsMap, groupOrder)) {
        result.push({
            name,
            machineIds: machineIds.filter(id => groupsMap[id] === name),
        });
    }

    const ungroupedIds = machineIds.filter(id => !groupsMap[id]);
    if (ungroupedIds.length > 0) {
        result.push({ name: UNGROUPED_MACHINE_GROUP_KEY, machineIds: ungroupedIds });
    }

    return result;
}

export function moveMachineGroupOrderItem(items: string[], item: string, targetIndex: number): string[] {
    const currentIndex = items.indexOf(item);
    if (currentIndex === -1) return items;

    const next = [...items];
    next.splice(currentIndex, 1);
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, item);
    return next;
}

export function appendMachineGroupOrderIfMissing(groupOrder: string[], groupName: string): string[] {
    const trimmed = groupName.trim();
    if (!trimmed || trimmed === UNGROUPED_MACHINE_GROUP_KEY || groupOrder.includes(trimmed)) {
        return groupOrder;
    }

    return [...groupOrder, trimmed];
}

export function buildMachineGroupPickerOptions(
    groupsMap: Record<string, string>,
    groupOrder: string[],
    machineId: string,
    labels: { ungrouped?: string; newGroup?: string } = {},
): MachineGroupPickerOption[] {
    const currentGroup = groupsMap[machineId]?.trim() || '';
    const groups = getOrderedMachineGroupNames(groupsMap, groupOrder);

    return [
        {
            key: UNGROUPED_MACHINE_GROUP_KEY,
            label: labels.ungrouped ?? 'Ungrouped',
            selected: currentGroup === '',
        },
        ...groups.map((name) => ({
            key: name,
            label: name,
            selected: currentGroup === name,
        })),
        {
            key: NEW_MACHINE_GROUP_KEY,
            label: labels.newGroup ?? 'New Group',
            selected: false,
        },
    ];
}
