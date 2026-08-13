import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';
import { agentInputStylesheet } from './agentInputStyles';

vi.mock('react-native', () => ({
    Platform: { select: (values: Record<string, unknown>) => values.default },
}));
vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (factory: unknown) => factory },
}));

const agentInputSource = readFileSync(new URL('./AgentInput.tsx', import.meta.url), 'utf8');
const settingsOverlaySource = readFileSync(new URL('./AgentInputSettingsOverlay.tsx', import.meta.url), 'utf8');

describe('AgentInput compact model settings', () => {
    it('renders model and reasoning options by name without provider descriptions', () => {
        expect(settingsOverlaySource).toContain('label={model.name}');
        expect(settingsOverlaySource).toContain('label={level.name}');
        expect(settingsOverlaySource).not.toContain('{model.description}');
        expect(settingsOverlaySource).not.toContain('{level.description}');
        expect(agentInputSource).toContain('<AgentInputSettingsOverlay');
        expect(agentInputStylesheet).toBeDefined();
    });
});
