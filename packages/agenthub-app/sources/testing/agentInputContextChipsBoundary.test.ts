import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');

describe('agent input context chips boundary', () => {
    it('owns machine and working-folder context actions outside AgentInput', () => {
        const chipsPath = path.join(componentsDir, 'AgentInputContextChips.tsx');
        expect(fs.existsSync(chipsPath)).toBe(true);

        const chipsSource = fs.readFileSync(chipsPath, 'utf8');
        expect(chipsSource).toContain('selectMachineAccessibility');
        expect(chipsSource).toContain('browseFolderAccessibility');
        expect(chipsSource).toContain('onMachineClick');
        expect(chipsSource).toContain('onPathClick');
    });

    it('keeps AgentInput responsible only for passing context state and callbacks', () => {
        expect(agentInputSource).toContain("import { AgentInputContextChips } from './AgentInputContextChips';");
        expect(agentInputSource).toContain('<AgentInputContextChips');
        expect(agentInputSource).not.toContain('desktop-outline');
        expect(agentInputSource).not.toContain('browseFolderAccessibility');
    });
});
