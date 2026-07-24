export function getInitialActionMenuFocusIndex(items: ReadonlyArray<{ disabled?: boolean }>): number {
    return items.findIndex((item) => !item.disabled);
}
