import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import { getChatCanvasTextureVisuals, getChatFooterVisuals, getChatHeaderVisuals, getChatShellVisuals } from './chatShellVisuals';

describe('getChatShellVisuals', () => {
    it('maps the chat shell to AgentHub canvas and glass input surfaces', () => {
        expect(getChatShellVisuals(darkTheme)).toEqual({
            backgroundColor: darkTheme.colors.canvas,
            contentBackgroundColor: darkTheme.colors.canvas,
            inputBackgroundColor: darkTheme.colors.glass.background,
            inputBorderColor: darkTheme.colors.glass.border,
            overlayColor: darkTheme.colors.overlay.scrim,
        });
    });
});

describe('getChatCanvasTextureVisuals', () => {
    it('adds a low-contrast texture in both themes so glass has material behind it', () => {
        expect(getChatCanvasTextureVisuals(darkTheme)).toMatchObject({
            enabled: true,
            baseGradientColors: ['rgba(255, 255, 255, 0.018)', 'rgba(255, 255, 255, 0)', 'rgba(255, 178, 46, 0.012)'],
            verticalLineColor: 'rgba(238, 248, 250, 0.026)',
            horizontalLineColor: 'rgba(238, 248, 250, 0.018)',
        });
        expect(getChatCanvasTextureVisuals(lightTheme)).toMatchObject({
            enabled: true,
            baseGradientColors: ['rgba(255, 255, 255, 0.74)', 'rgba(232, 241, 244, 0.34)', 'rgba(217, 144, 18, 0.026)'],
            mistGradientColors: ['rgba(255, 255, 255, 0.50)', 'rgba(221, 234, 240, 0)'],
            verticalLineColor: 'rgba(28, 44, 52, 0.026)',
            horizontalLineColor: 'rgba(28, 44, 52, 0.018)',
            diagonalSheenColor: 'rgba(255, 255, 255, 0.58)',
        });
    });
});

describe('getChatHeaderVisuals', () => {
    it('uses raised glass for the sticky chat header', () => {
        expect(getChatHeaderVisuals(lightTheme)).toEqual({
            backgroundColor: lightTheme.colors.glass.raised,
            borderColor: lightTheme.colors.glass.border,
            tintColor: lightTheme.colors.text,
            mutedColor: lightTheme.colors.textSecondary,
            shadowColor: lightTheme.colors.glass.shadow,
        });
    });
});

describe('getChatFooterVisuals', () => {
    it('uses a warning glass pill for controlled-by-user footer state', () => {
        expect(getChatFooterVisuals(darkTheme)).toMatchObject({
            backgroundColor: darkTheme.colors.accentSoft,
            borderColor: darkTheme.colors.box.warning.border,
            textColor: darkTheme.colors.box.warning.text,
        });
    });
});
