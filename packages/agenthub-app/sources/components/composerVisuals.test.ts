import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import {
    getComposerActionButtonVisuals,
    getComposerActionRowLayout,
    getComposerPanelVisuals,
    getComposerSendButtonChrome,
    getComposerSendButtonHighlightGeometry,
    getComposerSendButtonVisuals,
    getComposerSupplementalSurfaceVisuals,
    getComposerOverlayVisuals,
} from './composerVisuals';

describe('AgentHub composer visuals', () => {
    it('uses a raised glass panel for the composer surface', () => {
        expect(getComposerPanelVisuals(darkTheme)).toEqual({
            backgroundColor: darkTheme.colors.glass.raised,
            borderColor: darkTheme.colors.glass.border,
            gradientColors: ['rgba(255, 255, 255, 0.050)', 'rgba(17, 24, 27, 0.30)', 'rgba(0, 0, 0, 0.20)'],
            topHighlightColor: darkTheme.colors.glass.edgeBright,
            bottomShadeColor: 'rgba(0, 0, 0, 0.22)',
            shadowColor: darkTheme.colors.glass.shadow,
            inputTextColor: darkTheme.colors.input.text,
            placeholderColor: darkTheme.colors.input.placeholder,
        });
    });

    it('uses subtle amber glass for action controls', () => {
        expect(getComposerActionButtonVisuals(lightTheme, false)).toEqual({
            backgroundColor: 'transparent',
            iconColor: lightTheme.colors.accent,
            pressedBackgroundColor: lightTheme.colors.accentSoft,
        });

        expect(getComposerActionButtonVisuals(lightTheme, true).backgroundColor).toBe(lightTheme.colors.accentSoft);
    });

    it('maps send button states to active, idle, and locked visuals', () => {
        expect(getComposerSendButtonVisuals(lightTheme, 'active')).toEqual({
            backgroundColor: lightTheme.colors.accent,
            borderColor: lightTheme.colors.accent,
            iconColor: lightTheme.colors.button.primary.tint,
        });

        expect(getComposerSendButtonVisuals(darkTheme, 'idle')).toMatchObject({
            backgroundColor: 'rgba(170, 181, 188, 0.20)',
            borderColor: 'rgba(217, 225, 229, 0.22)',
            iconColor: 'rgba(226, 233, 236, 0.74)',
            gradientColors: ['rgba(247, 250, 251, 0.32)', 'rgba(157, 169, 176, 0.20)', 'rgba(80, 92, 100, 0.24)'],
            highlightColor: 'rgba(255, 255, 255, 0.18)',
            secondaryHighlightColor: 'rgba(255, 255, 255, 0.080)',
            shadowOpacity: 0.20,
            elevation: 2,
        });

        expect(getComposerSendButtonVisuals(darkTheme, 'locked')).toMatchObject({
            backgroundColor: 'rgba(170, 181, 188, 0.18)',
            borderColor: 'rgba(217, 225, 229, 0.24)',
            iconColor: 'rgba(226, 233, 236, 0.72)',
            gradientColors: ['rgba(241, 245, 247, 0.30)', 'rgba(145, 157, 165, 0.18)', 'rgba(72, 83, 91, 0.22)'],
            highlightColor: 'rgba(255, 255, 255, 0.16)',
            secondaryHighlightColor: 'rgba(255, 255, 255, 0.070)',
            shadowOpacity: 0.18,
            elevation: 2,
        });

        expect(getComposerSendButtonVisuals(lightTheme, 'idle')).toMatchObject({
            backgroundColor: '#DCE2E5',
            borderColor: 'rgba(155, 166, 174, 0.36)',
            iconColor: '#707B83',
            gradientColors: ['#F8F9FA', '#DDE4E7', '#B9C3C9'],
            highlightColor: 'rgba(255, 255, 255, 0.64)',
        });
    });

    it('keeps the chat send button chrome aligned with the new session composer', () => {
        expect(getComposerSendButtonChrome(darkTheme)).toEqual({
            size: 40,
            borderRadius: 20,
            shadowColor: darkTheme.colors.accentGlow,
            shadowOpacity: 0.34,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 5,
            iconColor: darkTheme.colors.button.primary.tint,
            iconTranslateX: -1,
            iconTranslateY: 1,
        });

        expect(getComposerSendButtonChrome(lightTheme)).toMatchObject({
            size: 40,
            borderRadius: 20,
            shadowOpacity: 0.24,
            iconColor: lightTheme.colors.button.primary.tint,
        });
    });

    it('uses compact spot highlights inside the circular send button', () => {
        const chrome = getComposerSendButtonChrome(lightTheme);
        const highlights = getComposerSendButtonHighlightGeometry();

        expect(highlights.primary).toEqual({
            top: 4,
            left: 9,
            width: 18,
            height: 9,
            borderRadius: 999,
            transform: [{ rotate: '-18deg' }],
        });
        expect(highlights.primary.width).toBeLessThan(chrome.size * 0.5);
        expect(highlights.primary.height).toBeGreaterThan(highlights.primary.width * 0.45);
        expect('right' in highlights.primary).toBe(false);

        expect(highlights.secondary).toEqual({
            top: 15,
            left: 13,
            width: 13,
            height: 11,
            borderRadius: 999,
            transform: [{ rotate: '-18deg' }],
        });
    });

    it('scales send button spot highlight geometry for the new session composer', () => {
        const scale = (value: number) => Math.max(1, Math.round(value * 0.8));

        expect(getComposerSendButtonHighlightGeometry(scale)).toEqual({
            primary: {
                top: 3,
                left: 7,
                width: 14,
                height: 7,
                borderRadius: 999,
                transform: [{ rotate: '-18deg' }],
            },
            secondary: {
                top: 12,
                left: 10,
                width: 10,
                height: 9,
                borderRadius: 999,
                transform: [{ rotate: '-18deg' }],
            },
        });
    });

    it('uses glass surfaces for context and attachment chip rows', () => {
        expect(getComposerSupplementalSurfaceVisuals(lightTheme)).toEqual({
            backgroundColor: lightTheme.colors.glass.background,
            borderColor: lightTheme.colors.glass.border,
        });
    });

    it('uses solid raised surfaces for composer popover overlays', () => {
        expect(getComposerOverlayVisuals(darkTheme)).toEqual({
            backgroundColor: '#05090A',
            borderColor: 'rgba(226, 238, 243, 0.22)',
            backgroundGradientColors: ['rgba(255, 255, 255, 0.026)', 'rgba(5, 9, 10, 0.98)', 'rgba(0, 0, 0, 0.24)'],
            innerRimColor: 'rgba(0, 0, 0, 0.34)',
            topHighlightColor: 'transparent',
            cornerGlowColor: 'transparent',
            bottomShadeColor: 'rgba(0, 0, 0, 0.34)',
            shadowColor: darkTheme.colors.glass.shadow,
            shadowOpacity: 0.38,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 18 },
        });

        expect(getComposerOverlayVisuals(lightTheme)).toMatchObject({
            backgroundColor: '#FFFDF8',
            backgroundGradientColors: ['rgba(255, 255, 255, 0.78)', '#FFFDF8', 'rgba(217, 144, 18, 0.026)'],
            innerRimColor: 'rgba(255, 255, 255, 0.52)',
            cornerGlowColor: 'rgba(255, 255, 255, 0.34)',
            bottomShadeColor: 'rgba(70, 48, 16, 0.032)',
            shadowOpacity: 0.16,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 12 },
        });
    });

    it('preserves the original composer action sizing and send spacing', () => {
        expect(getComposerActionRowLayout()).toEqual({
            minActionRailWidth: 0,
            sendGap: 12,
            actionIconMinWidth: 32,
        });
    });
});
