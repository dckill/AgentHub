import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import { getGlassButtonColors, getGlassTextFieldColors, getStatusChipColors } from './glassStyles';

describe('AgentHub glass primitive styles', () => {
    it('uses primary button tokens for filled buttons in both themes', () => {
        expect(getGlassButtonColors(darkTheme, 'primary')).toEqual({
            backgroundColor: darkTheme.colors.button.primary.background,
            borderColor: darkTheme.colors.button.primary.background,
            textColor: darkTheme.colors.button.primary.tint,
        });
        expect(getGlassButtonColors(lightTheme, 'primary')).toEqual({
            backgroundColor: lightTheme.colors.button.primary.background,
            borderColor: lightTheme.colors.button.primary.background,
            textColor: lightTheme.colors.button.primary.tint,
        });
    });

    it('uses glass background and contrast-safe text for secondary buttons', () => {
        expect(getGlassButtonColors(darkTheme, 'secondary')).toMatchObject({
            backgroundColor: darkTheme.colors.glass.raised,
            borderColor: darkTheme.colors.border,
            textColor: darkTheme.colors.text,
        });
        expect(getGlassButtonColors(lightTheme, 'secondary')).toMatchObject({
            backgroundColor: lightTheme.colors.glass.raised,
            borderColor: lightTheme.colors.border,
            textColor: lightTheme.colors.text,
        });
    });

    it('maps status chips to semantic color plus a contrast-safe label channel', () => {
        expect(getStatusChipColors(lightTheme, 'running')).toMatchObject({
            backgroundColor: 'rgba(255, 248, 235, 0.82)',
            borderColor: 'rgba(217, 144, 18, 0.20)',
            textColor: lightTheme.colors.text,
            dotColor: lightTheme.colors.accent,
        });
        expect(getStatusChipColors(lightTheme, 'active')).toMatchObject({
            textColor: lightTheme.colors.text,
            dotColor: lightTheme.colors.success,
        });
        expect(getStatusChipColors(lightTheme, 'offline')).toMatchObject({
            textColor: lightTheme.colors.textSecondary,
            dotColor: lightTheme.colors.textMuted,
        });
        expect(getStatusChipColors(darkTheme, 'error')).toMatchObject({
            backgroundColor: darkTheme.colors.box.error.background,
            borderColor: 'rgba(239, 61, 61, 0.18)',
            textColor: darkTheme.colors.textDestructive,
            dotColor: darkTheme.colors.textDestructive,
        });
    });

    it('promotes text field border to strong amber on focus and danger on error', () => {
        expect(getGlassTextFieldColors(lightTheme, true).borderColor).toBe(lightTheme.colors.borderStrong);
        expect(getGlassTextFieldColors(lightTheme, false).borderColor).toBe(lightTheme.colors.border);
        expect(getGlassTextFieldColors(darkTheme, true, true).borderColor).toBe(darkTheme.colors.textDestructive);
    });
});
