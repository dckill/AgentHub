import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import {
    getCodeBlockVisuals,
    getDiffHeaderVisuals,
    getDiffStatColors,
    getTerminalSurfaceVisuals,
} from './codeSurfaceVisuals';

describe('code surface visuals', () => {
    it('uses shared code-surface tokens for code blocks', () => {
        expect(getCodeBlockVisuals(darkTheme)).toEqual({
            backgroundColor: darkTheme.colors.codeSurface.background,
            borderColor: darkTheme.colors.codeSurface.border,
            headerBackgroundColor: darkTheme.colors.codeSurface.headerBackground,
            headerBorderColor: darkTheme.colors.codeSurface.border,
            textColor: darkTheme.colors.terminal.stdout,
            languageColor: darkTheme.colors.textSecondary,
            gutterBackgroundColor: darkTheme.colors.codeSurface.gutterBackground,
            gutterBorderColor: darkTheme.colors.codeSurface.gutterBorder,
            copyButtonBackgroundColor: darkTheme.colors.surfaceHighest,
            copyButtonBorderColor: darkTheme.colors.glass.border,
            copyButtonTextColor: darkTheme.colors.text,
        });

        expect(getCodeBlockVisuals(lightTheme)).toMatchObject({
            backgroundColor: lightTheme.colors.codeSurface.background,
            borderColor: lightTheme.colors.codeSurface.border,
            headerBackgroundColor: lightTheme.colors.codeSurface.headerBackground,
            headerBorderColor: lightTheme.colors.codeSurface.border,
            textColor: lightTheme.colors.syntaxDefault,
            languageColor: lightTheme.colors.textMuted,
            gutterBackgroundColor: lightTheme.colors.codeSurface.gutterBackground,
            gutterBorderColor: lightTheme.colors.codeSurface.gutterBorder,
        });
    });

    it('uses terminal palette for command output surfaces', () => {
        expect(getTerminalSurfaceVisuals(lightTheme)).toEqual({
            backgroundColor: lightTheme.colors.terminal.background,
            borderColor: lightTheme.colors.glass.border,
            promptColor: lightTheme.colors.terminal.prompt,
            commandColor: lightTheme.colors.terminal.command,
        });
    });

    it('uses raised glass for diff file headers', () => {
        expect(getDiffHeaderVisuals(darkTheme)).toEqual({
            backgroundColor: darkTheme.colors.codeSurface.headerBackground,
            borderColor: darkTheme.colors.codeSurface.border,
            textColor: darkTheme.colors.textSecondary,
            iconColor: darkTheme.colors.accent,
        });
    });

    it('uses diff token colors for addition and deletion stats', () => {
        expect(getDiffStatColors(lightTheme)).toEqual({
            addedText: lightTheme.colors.diff.addedText,
            removedText: lightTheme.colors.diff.removedText,
            addedBackground: lightTheme.colors.diff.addedBg,
            removedBackground: lightTheme.colors.diff.removedBg,
        });
    });
});
