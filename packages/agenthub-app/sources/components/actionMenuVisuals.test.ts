import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import { getActionMenuItemVisuals, getActionMenuSurfaceVisuals } from './actionMenuVisuals';

describe('getActionMenuSurfaceVisuals', () => {
    it('uses dimensional raised AgentHub surfaces for action menus', () => {
        expect(getActionMenuSurfaceVisuals(darkTheme)).toEqual({
            backgroundColor: '#05090A',
            backgroundGradientColors: ['rgba(255, 255, 255, 0.034)', 'rgba(5, 9, 10, 0.98)', 'rgba(0, 0, 0, 0.26)'],
            borderColor: 'rgba(226, 238, 243, 0.24)',
            headerGradientColors: ['rgba(255, 255, 255, 0.060)', 'rgba(255, 196, 88, 0.050)', 'rgba(5, 9, 10, 0.18)'],
            shadowColor: darkTheme.colors.glass.shadow,
            headerBackgroundColor: 'rgba(255, 255, 255, 0.026)',
            highlightColor: darkTheme.colors.glass.edgeBright,
            rimGlowColor: 'rgba(0, 0, 0, 0.34)',
            titleColor: darkTheme.colors.text,
        });

        expect(getActionMenuSurfaceVisuals(lightTheme)).toMatchObject({
            backgroundColor: '#FFFDF8',
            backgroundGradientColors: ['rgba(255, 255, 255, 0.86)', '#FFFDF8', 'rgba(217, 137, 0, 0.028)'],
            borderColor: lightTheme.colors.glass.borderStrong,
            headerGradientColors: ['#FFFDF8', '#FFF4DE'],
            headerBackgroundColor: '#FFF4DE',
            rimGlowColor: 'rgba(217, 137, 0, 0.14)',
            titleColor: lightTheme.colors.text,
        });
    });

    it('keeps the warm gradient scoped to the header instead of the menu item list', () => {
        expect(getActionMenuSurfaceVisuals(lightTheme)).toMatchObject({
            backgroundGradientColors: ['rgba(255, 255, 255, 0.86)', '#FFFDF8', 'rgba(217, 137, 0, 0.028)'],
            headerGradientColors: ['#FFFDF8', '#FFF4DE'],
        });
    });
});

describe('getActionMenuItemVisuals', () => {
    it('marks selected items with accent colors and selected accessibility state', () => {
        expect(getActionMenuItemVisuals(lightTheme, { selected: true })).toMatchObject({
            iconColor: lightTheme.colors.accent,
            labelColor: lightTheme.colors.text,
            checkColor: lightTheme.colors.accent,
            accessibilityState: { selected: true, disabled: false },
        });
    });

    it('marks destructive items with error colors', () => {
        expect(getActionMenuItemVisuals(darkTheme, { destructive: true })).toMatchObject({
            iconColor: darkTheme.colors.textDestructive,
            labelColor: darkTheme.colors.textDestructive,
            checkColor: darkTheme.colors.accent,
        });
    });

    it('dims disabled items without dropping selected metadata', () => {
        expect(getActionMenuItemVisuals(darkTheme, { disabled: true, selected: true })).toMatchObject({
            opacity: 0.46,
            accessibilityState: { selected: true, disabled: true },
        });
    });
});
