import { describe, expect, it } from 'vitest';
import { agentHubTokens, createAgentHubRuntimeTheme, getAgentHubRootBackground } from './agenthubTheme';

const darkTheme = createAgentHubRuntimeTheme('dark');
const lightTheme = createAgentHubRuntimeTheme('light');

function relativeLuminance(hex: string): number {
    const channels = hex.match(/[0-9a-f]{2}/gi)?.map(value => Number.parseInt(value, 16) / 255) ?? [];
    const [red = 0, green = 0, blue = 0] = channels.map(value => (
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
    const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
    const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

describe('AgentHub Amber Crystal theme tokens', () => {
    it('maps Design.md dark tokens into the runtime dark theme', () => {
        expect(darkTheme.colors.canvas).toBe(agentHubTokens.dark.canvas);
        expect(darkTheme.colors.surface).toBe(agentHubTokens.dark.surface);
        expect(darkTheme.colors.surfaceHigh).toBe(agentHubTokens.dark.surfaceRaised);
        expect(darkTheme.colors.accent).toBe('#FFB22E');
        expect(darkTheme.colors.text).toBe('#F3EFE7');
        expect(darkTheme.colors.button.primary.background).toBe('#FFB22E');
        expect(darkTheme.colors.button.primary.tint).toBe('#080A0B');
    });

    it('maps Design.md light tokens into the runtime light theme', () => {
        expect(lightTheme.colors.canvas).toBe(agentHubTokens.light.canvas);
        expect(lightTheme.colors.surface).toBe(agentHubTokens.light.surface);
        expect(lightTheme.colors.surfaceHigh).toBe(agentHubTokens.light.surfaceRaised);
        expect(lightTheme.colors.accent).toBe('#D99012');
        expect(lightTheme.colors.text).toBe('#0E1720');
        expect(lightTheme.colors.button.primary.background).toBe('#D99012');
        expect(lightTheme.colors.button.primary.tint).toBe('#111719');
    });

    it('keeps compatibility fields while exposing AgentHub semantic glass fields', () => {
        expect(lightTheme.colors.glass.background).toBe(lightTheme.colors.surface);
        expect(lightTheme.colors.glass.border).toBe(lightTheme.colors.border);
        expect(lightTheme.colors.focus.ring).toBe(lightTheme.colors.borderStrong);
        expect(lightTheme.colors.overlay.scrim).toContain('rgba');

        expect(darkTheme.colors.input.background).toBe(darkTheme.colors.surfaceRaised);
        expect(darkTheme.colors.input.text).toBe(darkTheme.colors.text);
        expect(darkTheme.colors.input.placeholder).toBe(darkTheme.colors.textMuted);
    });

    it('uses canvas as the root background for both modes', () => {
        expect(getAgentHubRootBackground('dark')).toBe('#070A0B');
        expect(getAgentHubRootBackground('light')).toBe('#F6F9FA');
    });

    it('uses a porcelain glass light hierarchy instead of plain white panels', () => {
        expect(lightTheme.colors.canvas).toBe('#F6F9FA');
        expect(lightTheme.colors.groupped.background).toBe('#EEF4F6');
        expect(lightTheme.colors.header.background).toBe('#EEF4F6');
        expect(lightTheme.colors.border).toBe('rgba(28, 44, 52, 0.14)');
        expect(lightTheme.colors.glass.edgeBright).toBe('rgba(255, 255, 255, 0.98)');
        expect(lightTheme.colors.glass.edgeMuted).toBe('rgba(28, 44, 52, 0.085)');
        expect(lightTheme.colors.glass.edgeWarm).toBe('rgba(217, 144, 18, 0.15)');
        expect(lightTheme.colors.accentSoft).toBe('rgba(217, 144, 18, 0.105)');
        expect(lightTheme.colors.switch.thumb.active).toBe('#FFFDF8');
        expect(lightTheme.colors.switch.thumb.inactive).toBe('#F8FBFC');
    });

    it('uses a deep graphite glass hierarchy instead of gray panels', () => {
        expect(agentHubTokens.dark.canvas).toBe('#070A0B');
        expect(agentHubTokens.dark.canvasElevated).toBe('#0B1012');
        expect(agentHubTokens.dark.surface).toBe('rgba(12, 17, 19, 0.72)');
        expect(agentHubTokens.dark.surfaceRaised).toBe('rgba(17, 24, 27, 0.84)');
        expect(darkTheme.colors.header.background).toBe('#0B1012');
        expect(darkTheme.colors.glass.border).toBe('rgba(238, 248, 250, 0.13)');
        expect(darkTheme.colors.glass.edgeBright).toBe('rgba(255, 255, 255, 0.26)');
        expect(darkTheme.colors.glass.edgeWarm).toBe('rgba(255, 196, 88, 0.12)');
        expect(darkTheme.colors.switch.thumb.active).toBe('#FFF1D6');
        expect(darkTheme.colors.switch.thumb.inactive).toBe('#D7E0E3');
        expect(darkTheme.colors.overlay.scrim).toBe('rgba(2, 4, 5, 0.74)');
    });

    it('keeps light code and git text at WCAG AA contrast on porcelain surfaces', () => {
        const porcelainCodeSurface = '#FEFFFF';
        const textColors = [
            lightTheme.colors.syntaxFunction,
            lightTheme.colors.syntaxString,
            lightTheme.colors.diff.lineNumberText,
            lightTheme.colors.gitAddedText,
        ];

        for (const color of textColors) {
            expect(contrastRatio(color, porcelainCodeSurface), color).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps light semantic success text at WCAG AA contrast on raised porcelain', () => {
        expect(contrastRatio(lightTheme.colors.success, '#EEF4F6')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps input placeholders at WCAG AA contrast after glass compositing', () => {
        expect(contrastRatio(lightTheme.colors.input.placeholder, '#F9FBFC')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(darkTheme.colors.input.placeholder, '#0F1618')).toBeGreaterThanOrEqual(4.5);
    });
});
