import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');
const actionRailSource = fs.readFileSync(path.join(componentsDir, 'AgentInputActionRail.tsx'), 'utf8');
const menuButtonsSource = fs.readFileSync(path.join(componentsDir, 'AgentInputMenuButtons.tsx'), 'utf8');

describe('AgentInput menu trigger boundary', () => {
    it('owns attachment and slash-command trigger buttons outside AgentInput', () => {
        const menuButtonsPath = path.join(componentsDir, 'AgentInputMenuButtons.tsx');
        expect(fs.existsSync(menuButtonsPath)).toBe(true);

        expect(menuButtonsSource).toContain('attachmentMenuOpen');
        expect(menuButtonsSource).toContain('slashMenuOpen');
        expect(menuButtonsSource).toContain('attachmentMenu.projectFiles');
        expect(menuButtonsSource).toContain('slashCommands.help');
    });

    it('keeps the permission settings trigger with the other menu buttons', () => {
        expect(menuButtonsSource).toContain('settingsOpen');
        expect(menuButtonsSource).toContain('agentInput.permissionMode.title');
        expect(menuButtonsSource).toContain('name={\'gear\'}');
        expect(agentInputSource).toContain('settingsOpen={showSettings}');
    });

    it('keeps AgentInput responsible only for menu state and callback wiring', () => {
        expect(agentInputSource).toContain("from './AgentInputActionRail'");
        expect(actionRailSource).toContain("import { AgentInputMenuButtons } from './AgentInputMenuButtons';");
        expect(actionRailSource).toContain('<AgentInputMenuButtons');
        expect(agentInputSource).not.toContain('name="mention"');
    });
});
