import { describe, expect, it, vi } from 'vitest';
import { darkTheme, lightTheme } from '@/theme';
import {
    getAgentEventVisuals,
    getAgentMessageVisuals,
    getToolStateLabel,
    getToolStateTone,
    getToolSurfaceVisuals,
    getUserMessageVisuals,
} from './messageSurfaceVisuals';

vi.mock('@/text', () => ({ t: (key: string) => key }));

describe('message surface visuals', () => {
    it('uses amber glass for user messages', () => {
        expect(getUserMessageVisuals(darkTheme)).toEqual({
            backgroundColor: 'rgba(255, 178, 46, 0.105)',
            borderColor: darkTheme.colors.glass.edgeWarm,
            textColor: darkTheme.colors.userMessageText,
        });
    });

    it('uses transparent agent text with readable foreground', () => {
        expect(getAgentMessageVisuals(lightTheme)).toEqual({
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            textColor: lightTheme.colors.text,
        });
    });

    it('uses a subtle glass event pill', () => {
        expect(getAgentEventVisuals(darkTheme)).toEqual({
            backgroundColor: darkTheme.colors.glass.background,
            borderColor: darkTheme.colors.glass.border,
            textColor: darkTheme.colors.agentEventText,
        });
    });

    it('maps tool state to AgentHub chip tone', () => {
        expect(getToolStateTone('running')).toBe('running');
        expect(getToolStateTone('completed')).toBe('completed');
        expect(getToolStateTone('error')).toBe('error');
    });

    it('localizes visible tool state chips', () => {
        expect(getToolStateLabel('running')).toBe('toolView.stateRunning');
        expect(getToolStateLabel('completed')).toBe('toolView.stateCompleted');
        expect(getToolStateLabel('error')).toBe('toolView.stateError');
    });

    it('uses raised glass for tool surfaces', () => {
        expect(getToolSurfaceVisuals(lightTheme)).toEqual({
            backgroundColor: 'rgba(232, 239, 241, 0.74)',
            materialBackgroundColor: 'rgba(255, 255, 255, 0.86)',
            contentBackgroundColor: 'rgba(250, 253, 253, 0.64)',
            borderColor: 'rgba(28, 44, 52, 0.15)',
            innerBorderColor: 'rgba(255, 255, 255, 0.96)',
            dividerColor: 'rgba(28, 44, 52, 0.08)',
            shadowColor: lightTheme.colors.glass.shadow,
            headerBackgroundColor: 'rgba(255, 255, 255, 0.74)',
        });
        expect(getToolSurfaceVisuals(darkTheme)).toMatchObject({
            backgroundColor: 'rgba(5, 8, 9, 0.94)',
            materialBackgroundColor: 'rgba(28, 36, 40, 0.82)',
            contentBackgroundColor: 'rgba(14, 20, 23, 0.48)',
            borderColor: 'rgba(238, 248, 250, 0.16)',
            innerBorderColor: 'rgba(255, 255, 255, 0.055)',
            dividerColor: 'rgba(255, 255, 255, 0.055)',
            headerBackgroundColor: 'rgba(255, 255, 255, 0.028)',
        });
    });
});
