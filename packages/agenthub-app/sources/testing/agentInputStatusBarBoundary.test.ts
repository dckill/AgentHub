import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');

describe('agent input status bar boundary', () => {
    it('owns connection, context, and permission status presentation outside AgentInput', () => {
        const statusPath = path.join(componentsDir, 'AgentInputStatusBar.tsx');
        expect(fs.existsSync(statusPath)).toBe(true);

        const statusSource = fs.readFileSync(statusPath, 'utf8');
        expect(statusSource).toContain('StatusDot');
        expect(statusSource).toContain('contextWarning');
        expect(statusSource).toContain('permissionModeKey');
        expect(statusSource).toContain('withSandboxSuffix');
    });

    it('keeps AgentInput responsible for deciding when the status bar is visible', () => {
        expect(agentInputSource).toContain("import { AgentInputStatusBar } from './AgentInputStatusBar';");
        expect(agentInputSource).toContain('<AgentInputStatusBar');
        expect(agentInputSource).toContain('props.connectionStatus || contextWarning');
    });
});
