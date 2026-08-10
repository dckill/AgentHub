import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');
const actionRailSource = fs.readFileSync(path.join(componentsDir, 'AgentInputActionRail.tsx'), 'utf8');
const actionButtonsPath = path.join(componentsDir, 'AgentInputActionButtons.tsx');

describe('AgentInput action button boundary', () => {
    it('owns the context and git action button implementations outside AgentInput', () => {
        expect(fs.existsSync(actionButtonsPath)).toBe(true);
        const actionButtonsSource = fs.readFileSync(actionButtonsPath, 'utf8');

        expect(actionButtonsSource).toContain('export function ContextRingButton');
        expect(actionButtonsSource).toContain('export function GitStatusButton');
        expect(agentInputSource).toContain("from './AgentInputActionRail'");
        expect(actionRailSource).toContain("import { ContextRingButton, GitStatusButton } from './AgentInputActionButtons';");
        expect(agentInputSource).not.toContain('function ContextRingButton');
        expect(agentInputSource).not.toContain('function GitStatusButton');
    });

    it('keeps both extracted actions as named, full-size buttons', () => {
        const actionButtonsSource = fs.readFileSync(actionButtonsPath, 'utf8');

        expect(actionButtonsSource).toContain('accessibilityRole="button"');
        expect(actionButtonsSource).toContain("accessibilityLabel={t('agentInput.context.compactConfirmAction')}");
        expect(actionButtonsSource).toContain("accessibilityLabel={t('files.changes')}");
        expect(actionButtonsSource).toContain('minHeight: 44');
        expect(actionButtonsSource).toContain('hapticsLight();');
    });
});
