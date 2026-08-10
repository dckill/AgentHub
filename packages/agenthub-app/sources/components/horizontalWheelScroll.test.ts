import { describe, expect, it } from 'vitest';

import { resolveHorizontalWheelDelta } from './horizontalWheelScroll';

describe('resolveHorizontalWheelDelta', () => {
    it('handles horizontal-dominant trackpad movement', () => {
        expect(resolveHorizontalWheelDelta({
            deltaX: 24,
            deltaY: 4,
            shiftKey: false,
            scrollLeft: 10,
            maxScroll: 200,
        })).toBe(24);
    });

    it('leaves vertical-dominant movement for the parent chat list', () => {
        expect(resolveHorizontalWheelDelta({
            deltaX: 4,
            deltaY: 24,
            shiftKey: false,
            scrollLeft: 10,
            maxScroll: 200,
        })).toBeNull();
    });

    it('maps shift-wheel movement to horizontal scrolling', () => {
        expect(resolveHorizontalWheelDelta({
            deltaX: 0,
            deltaY: 18,
            shiftKey: true,
            scrollLeft: 10,
            maxScroll: 200,
        })).toBe(18);
    });

    it('bubbles movement when the horizontal scroller is at a boundary', () => {
        expect(resolveHorizontalWheelDelta({
            deltaX: -4,
            deltaY: 0,
            shiftKey: false,
            scrollLeft: 0,
            maxScroll: 200,
        })).toBeNull();
        expect(resolveHorizontalWheelDelta({
            deltaX: 4,
            deltaY: 0,
            shiftKey: false,
            scrollLeft: 200,
            maxScroll: 200,
        })).toBeNull();
    });

    it('does not claim wheel events when there is no horizontal overflow', () => {
        expect(resolveHorizontalWheelDelta({
            deltaX: 20,
            deltaY: 0,
            shiftKey: false,
            scrollLeft: 0,
            maxScroll: 0,
        })).toBeNull();
    });
});
