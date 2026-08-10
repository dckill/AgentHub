import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const agentInputSource = readFileSync(new URL('./AgentInput.tsx', import.meta.url), 'utf8');
const settingsOverlaySource = readFileSync(new URL('./AgentInputSettingsOverlay.tsx', import.meta.url), 'utf8');

describe('AgentInput compact model settings', () => {
    it('renders model and reasoning options by name without provider descriptions', () => {
        expect(settingsOverlaySource).toContain('label={model.name}');
        expect(settingsOverlaySource).toContain('label={level.name}');
        expect(settingsOverlaySource).not.toContain('{model.description}');
        expect(settingsOverlaySource).not.toContain('{level.description}');
        expect(agentInputSource).toContain('<AgentInputSettingsOverlay');
    });
});
