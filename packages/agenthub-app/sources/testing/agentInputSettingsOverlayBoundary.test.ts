import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');

describe('agent input settings overlay boundary', () => {
    it('owns the settings overlay outside the main composer component', () => {
        const overlayPath = path.join(componentsDir, 'AgentInputSettingsOverlay.tsx');
        expect(fs.existsSync(overlayPath)).toBe(true);

        const overlaySource = fs.readFileSync(overlayPath, 'utf8');
        expect(overlaySource).toContain('AgentInputRadioOption');
        expect(overlaySource).toContain('role="radiogroup"');
        expect(overlaySource).toContain('onPermissionModeChange');
        expect(overlaySource).toContain('onModelModeChange');
        expect(overlaySource).toContain('onEffortLevelChange');
    });

    it('keeps AgentInput responsible only for overlay visibility and state wiring', () => {
        expect(agentInputSource).toContain("import { AgentInputSettingsOverlay } from './AgentInputSettingsOverlay';");
        expect(agentInputSource).toContain('<AgentInputSettingsOverlay');
        expect(agentInputSource).not.toContain('<AgentInputRadioOption');
    });
});
