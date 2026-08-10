export type HorizontalWheelInput = {
    deltaX: number;
    deltaY: number;
    shiftKey: boolean;
    scrollLeft: number;
    maxScroll: number;
};

/**
 * Returns the horizontal delta claimed by a nested scroller, or null when the
 * event should continue to the inverted chat list.
 */
export function resolveHorizontalWheelDelta(input: HorizontalWheelInput): number | null {
    if (input.maxScroll <= 0) {
        return null;
    }

    const canScroll = (delta: number): boolean => {
        if (delta < 0) return input.scrollLeft > 0;
        return delta > 0 && input.scrollLeft < input.maxScroll - 1;
    };

    if (input.shiftKey && input.deltaY !== 0) {
        return canScroll(input.deltaY) ? input.deltaY : null;
    }

    if (Math.abs(input.deltaX) > Math.abs(input.deltaY) && canScroll(input.deltaX)) {
        return input.deltaX;
    }

    return null;
}
