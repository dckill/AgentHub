import { describe, expect, it } from 'vitest';
import { getActionMenuAnchorFromEvent, getActionMenuPosition, getCenteredActionMenuFrame } from './actionMenuPosition';

describe('getActionMenuPosition', () => {
    it('aligns a rect anchor to the right edge and opens below when there is room', () => {
        expect(getActionMenuPosition({
            anchor: { type: 'rect', x: 300, y: 80, width: 48, height: 32 },
            itemCount: 3,
            menuWidth: 220,
            itemHeight: 48,
            viewportWidth: 640,
            viewportHeight: 480,
            margin: 12,
        })).toEqual({ left: 128, top: 120 });
    });

    it('flips a rect anchor above when the menu would overflow below', () => {
        expect(getActionMenuPosition({
            anchor: { type: 'rect', x: 300, y: 410, width: 48, height: 32 },
            itemCount: 3,
            menuWidth: 220,
            itemHeight: 48,
            viewportWidth: 640,
            viewportHeight: 480,
            margin: 12,
        })).toEqual({ left: 128, top: 258 });
    });

    it('keeps point anchored menus inside the viewport margin', () => {
        expect(getActionMenuPosition({
            anchor: { type: 'point', x: 620, y: 460 },
            itemCount: 2,
            menuWidth: 220,
            itemHeight: 48,
            viewportWidth: 640,
            viewportHeight: 480,
            margin: 12,
        })).toEqual({ left: 408, top: 372 });
    });

    it('centers native menus and constrains them to viewport margins', () => {
        expect(getCenteredActionMenuFrame({
            estimatedHeight: 700,
            margin: 24,
            maxWidth: 360,
            viewportHeight: 720,
            viewportWidth: 412,
        })).toEqual({
            width: 360,
            maxHeight: 672,
            left: 26,
            top: 24,
        });
    });

    it('extracts a point anchor from press events with a safe zero fallback', () => {
        expect(getActionMenuAnchorFromEvent({ nativeEvent: { pageX: 120, pageY: 240 } })).toEqual({
            type: 'point',
            x: 120,
            y: 240,
        });
        expect(getActionMenuAnchorFromEvent({ nativeEvent: {} })).toEqual({
            type: 'point',
            x: 0,
            y: 0,
        });
    });

    it('anchors keyboard activation to the trigger rectangle instead of the viewport origin', () => {
        expect(getActionMenuAnchorFromEvent({
            nativeEvent: { clientX: 0, clientY: 0 },
            currentTarget: {
                getBoundingClientRect: () => ({ left: 300, top: 80, width: 44, height: 44 }),
            },
        })).toEqual({
            type: 'rect',
            x: 300,
            y: 80,
            width: 44,
            height: 44,
        });
    });
});
