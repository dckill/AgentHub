import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import {
    getNavigationHeaderVisuals,
    getNavigationRootTheme,
    getNavigationStackVisuals,
    getStatusBarVisuals,
} from './navigationShellVisuals';

describe('getNavigationRootTheme', () => {
    it('maps React Navigation dark colors to AgentHub canvas and glass tokens', () => {
        expect(getNavigationRootTheme(darkTheme)).toMatchObject({
            dark: true,
            colors: {
                background: darkTheme.colors.canvas,
                card: darkTheme.colors.glass.raised,
                border: darkTheme.colors.border,
                text: darkTheme.colors.text,
                primary: darkTheme.colors.accent,
                notification: darkTheme.colors.warning,
            },
        });
    });

    it('maps React Navigation light colors to Amber Crystal Light tokens', () => {
        expect(getNavigationRootTheme(lightTheme)).toMatchObject({
            dark: false,
            colors: {
                background: lightTheme.colors.canvas,
                card: lightTheme.colors.glass.raised,
                border: lightTheme.colors.border,
                text: lightTheme.colors.text,
                primary: lightTheme.colors.accent,
                notification: lightTheme.colors.warning,
            },
        });
    });
});

describe('getNavigationStackVisuals', () => {
    it('uses canvas content and raised glass headers', () => {
        expect(getNavigationStackVisuals(darkTheme)).toEqual({
            contentBackgroundColor: darkTheme.colors.canvas,
            headerBackgroundColor: darkTheme.colors.glass.raised,
            headerTintColor: darkTheme.colors.text,
            headerBorderColor: darkTheme.colors.border,
        });
    });
});

describe('getNavigationHeaderVisuals', () => {
    it('uses glass shell values for custom native/web headers', () => {
        expect(getNavigationHeaderVisuals(lightTheme)).toEqual({
            backgroundColor: lightTheme.colors.glass.raised,
            transparentBackgroundColor: lightTheme.colors.canvas,
            borderColor: lightTheme.colors.border,
            tintColor: lightTheme.colors.text,
            subtitleColor: lightTheme.colors.textSecondary,
            shadowColor: lightTheme.colors.glass.shadow,
            highlightColor: lightTheme.colors.glass.highlight,
        });
    });
});

describe('getStatusBarVisuals', () => {
    it('keeps status and system chrome on AgentHub canvas', () => {
        expect(getStatusBarVisuals(darkTheme)).toEqual({
            style: 'light',
            backgroundColor: darkTheme.colors.canvas,
        });
        expect(getStatusBarVisuals(lightTheme)).toEqual({
            style: 'dark',
            backgroundColor: lightTheme.colors.canvas,
        });
    });
});
