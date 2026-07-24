import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import { getAmberRaisedButtonVisuals } from './amberVisuals';

describe('AgentHub amber raised button visuals', () => {
    it('uses a dimensional amber gradient with softer glass highlights and readable foregrounds', () => {
        const light = getAmberRaisedButtonVisuals(lightTheme);
        const dark = getAmberRaisedButtonVisuals(darkTheme);

        expect(light.colors).toEqual(['#FFE9B8', '#F6B33C', '#D99012']);
        expect(light.textColor).toBe(lightTheme.colors.button.primary.tint);
        expect(light.highlightColor).toBe('rgba(255, 255, 255, 0.42)');
        expect(light.secondaryHighlightColor).toBe('rgba(255, 255, 255, 0.18)');

        expect(dark.colors).toEqual(['#FFD77A', '#FFAF2E', '#D77A00']);
        expect(dark.textColor).toBe(darkTheme.colors.button.primary.tint);
        expect(dark.highlightColor).toBe('rgba(255, 255, 255, 0.22)');
        expect(dark.secondaryHighlightColor).toBe('rgba(255, 231, 170, 0.10)');
    });
});
