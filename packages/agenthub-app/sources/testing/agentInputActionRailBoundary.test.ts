import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');
const railPath = path.join(componentsDir, 'AgentInputActionRail.tsx');

describe('AgentInput action rail boundary', () => {
    it('owns the bottom action rail outside AgentInput', () => {
        expect(fs.existsSync(railPath)).toBe(true);
        const railSource = fs.readFileSync(railPath, 'utf8');

        expect(railSource).toContain('export function AgentInputActionRail');
        expect(railSource).toContain('<AgentInputMenuButtons');
        expect(railSource).toContain('<AgentInputSendButton');
        expect(agentInputSource).toContain("from './AgentInputActionRail'");
        expect(agentInputSource).not.toContain('<AgentInputMenuButtons');
        expect(agentInputSource).not.toContain('/* Abort button */');
    });

    it('keeps the rail viewport and full-size action semantics in the boundary', () => {
        const railSource = fs.readFileSync(railPath, 'utf8');

        expect(railSource).toContain('showsHorizontalScrollIndicator={false}');
        expect(railSource).toContain('minHeight: 54');
        expect(railSource).toContain('minWidth: actionRowLayout.actionIconMinWidth');
        expect(railSource).toContain('accessibilityLabel={t(\'slashCommands.abort\')}');
        expect(railSource).toContain('disabled={isAborting}');
    });
});
