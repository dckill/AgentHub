import type { ProjectListViewItem } from '@/sync/storage';

export function filterCollapsedMachineProjects(
    items: ProjectListViewItem[],
    collapsedMachineIds: ReadonlySet<string>,
): ProjectListViewItem[] {
    if (collapsedMachineIds.size === 0) {
        return items;
    }

    return items.filter((item) => {
        if (item.type === 'machine-separator') {
            return true;
        }
        return !collapsedMachineIds.has(item.project.machineId);
    });
}
