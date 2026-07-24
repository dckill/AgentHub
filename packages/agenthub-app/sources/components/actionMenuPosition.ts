export type ActionMenuAnchor =
    | {
        type: 'point';
        x: number;
        y: number;
    }
    | {
        type: 'rect';
        x: number;
        y: number;
        width: number;
        height: number;
    };

export interface ActionMenuPositionInput {
    anchor: ActionMenuAnchor;
    itemCount: number;
    itemHeight: number;
    margin: number;
    menuWidth: number;
    viewportHeight: number;
    viewportWidth: number;
}

export interface CenteredActionMenuFrameInput {
    estimatedHeight: number;
    margin: number;
    maxWidth: number;
    viewportHeight: number;
    viewportWidth: number;
}

export function getActionMenuAnchorFromEvent(event: {
    nativeEvent?: { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
    currentTarget?: {
        getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
    };
}): ActionMenuAnchor {
    const nativeEvent = event.nativeEvent ?? {};
    const x = nativeEvent.clientX ?? nativeEvent.pageX ?? 0;
    const y = nativeEvent.clientY ?? nativeEvent.pageY ?? 0;
    if (x !== 0 || y !== 0) {
        return { type: 'point', x, y };
    }

    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (rect) {
        return {
            type: 'rect',
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    return {
        type: 'point',
        x,
        y,
    };
}

export function getActionMenuPosition({
    anchor,
    itemCount,
    itemHeight,
    margin,
    menuWidth,
    viewportHeight,
    viewportWidth,
}: ActionMenuPositionInput): { left: number; top: number } {
    const estimatedHeight = itemCount * itemHeight;
    const maxLeft = viewportWidth - menuWidth - margin;
    const maxTop = viewportHeight - estimatedHeight - margin;

    const leftBase = anchor.type === 'point'
        ? anchor.x
        : anchor.x + anchor.width - menuWidth;

    let topBase = anchor.type === 'point'
        ? anchor.y
        : anchor.y + anchor.height + 8;

    if (anchor.type === 'rect' && topBase + estimatedHeight > viewportHeight - margin) {
        topBase = anchor.y - estimatedHeight - 8;
    }

    return {
        left: Math.max(margin, Math.min(maxLeft, leftBase)),
        top: Math.max(margin, Math.min(maxTop, topBase)),
    };
}

export function getCenteredActionMenuFrame({
    estimatedHeight,
    margin,
    maxWidth,
    viewportHeight,
    viewportWidth,
}: CenteredActionMenuFrameInput): { width: number; maxHeight: number; left: number; top: number } {
    const width = Math.max(0, Math.min(maxWidth, viewportWidth - margin * 2));
    const maxHeight = Math.max(0, viewportHeight - margin * 2);
    const renderedHeight = Math.min(estimatedHeight, maxHeight);

    return {
        width,
        maxHeight,
        left: Math.max(margin, Math.round((viewportWidth - width) / 2)),
        top: Math.max(margin, Math.round((viewportHeight - renderedHeight) / 2)),
    };
}
