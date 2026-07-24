import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import { getAgentLabelChipVisuals, getProjectCardVisuals, getSessionStateChip, getSessionRowVisuals } from './sessionListVisuals';

describe('getSessionStateChip', () => {
    it('maps active work states to AgentHub chip tones', () => {
        expect(getSessionStateChip('thinking', 'Pensando')).toEqual({ label: 'Pensando', tone: 'running' });
        expect(getSessionStateChip('permission_required', 'Permiso')).toEqual({ label: 'Permiso', tone: 'pending' });
        expect(getSessionStateChip('waiting', 'Listo')).toEqual({ label: 'Listo', tone: 'active' });
        expect(getSessionStateChip('disconnected', 'Sin conexión')).toEqual({ label: 'Sin conexión', tone: 'offline' });
    });
});

describe('getProjectCardVisuals', () => {
    it('uses raised glass for project cards', () => {
        expect(getProjectCardVisuals(darkTheme)).toEqual({
            backgroundColor: darkTheme.colors.glass.raised,
            borderColor: darkTheme.colors.glass.border,
            shadowColor: darkTheme.colors.glass.shadow,
        });
    });
});

describe('getSessionRowVisuals', () => {
    it('uses hover glass for normal rows and accent soft for selected rows', () => {
        expect(getSessionRowVisuals(lightTheme, false)).toMatchObject({
            backgroundColor: lightTheme.colors.glass.background,
            borderColor: lightTheme.colors.divider,
        });

        expect(getSessionRowVisuals(lightTheme, true)).toMatchObject({
            backgroundColor: lightTheme.colors.accentSoft,
            borderColor: lightTheme.colors.borderStrong,
        });
    });
});

describe('getAgentLabelChipVisuals', () => {
    it('uses compact filled labels with separate Codex and Claude colors', () => {
        expect(getAgentLabelChipVisuals(lightTheme, 'codex')).toMatchObject({
            backgroundColor: 'rgba(47, 115, 217, 0.12)',
            textColor: lightTheme.colors.text,
        });

        expect(getAgentLabelChipVisuals(lightTheme, 'claude')).toMatchObject({
            backgroundColor: 'rgba(21, 138, 75, 0.11)',
            textColor: lightTheme.colors.text,
        });
    });
});
