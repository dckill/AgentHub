import { describe, expect, it } from 'vitest';
import { createThemeSnapshot } from './theme.gen';

describe('AgentHub theme generator', () => {
    it('creates an AgentHub light token snapshot instead of a Material dynamic color scheme', () => {
        const snapshot = createThemeSnapshot('light');

        expect(snapshot.designSystem).toBe('AgentHub Amber Crystal');
        expect(snapshot.mode).toBe('light');
        expect(snapshot.colors.canvas).toBe('#F6F9FA');
        expect(snapshot.colors.accent).toBe('#D99012');
        expect(snapshot.colors.surfaceRaised).toBe('rgba(255, 255, 255, 0.88)');
        expect(snapshot.colors).not.toHaveProperty('primaryContainer');
    });

    it('creates an AgentHub dark token snapshot with glass and motion metadata', () => {
        const snapshot = createThemeSnapshot('dark');

        expect(snapshot.designSystem).toBe('AgentHub Amber Crystal');
        expect(snapshot.mode).toBe('dark');
        expect(snapshot.colors.canvas).toBe('#070A0B');
        expect(snapshot.colors.accent).toBe('#FFB22E');
        expect(snapshot.glass.blur.md).toBe(18);
        expect(snapshot.motion.fast).toBe(120);
    });
});
