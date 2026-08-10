import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');
const actionRailSource = fs.readFileSync(path.join(componentsDir, 'AgentInputActionRail.tsx'), 'utf8');
const sendButtonPath = path.join(componentsDir, 'AgentInputSendButton.tsx');

describe('AgentInput send button boundary', () => {
    it('owns the send button implementation outside AgentInput', () => {
        expect(fs.existsSync(sendButtonPath)).toBe(true);
        const sendButtonSource = fs.readFileSync(sendButtonPath, 'utf8');

        expect(sendButtonSource).toContain('export function AgentInputSendButton');
        expect(sendButtonSource).toContain("accessibilityLabel={t('agentInput.send')}");
        expect(agentInputSource).toContain("from './AgentInputActionRail'");
        expect(actionRailSource).toContain("from './AgentInputSendButton'");
        expect(agentInputSource).not.toContain("accessibilityLabel={t('agentInput.send')}");
    });

    it('keeps send state, loading, locked, and gradient visual branches in the boundary', () => {
        const sendButtonSource = fs.readFileSync(sendButtonPath, 'utf8');

        expect(sendButtonSource).toContain('canPressSendButton');
        expect(sendButtonSource).toContain('isSendBlocked');
        expect(sendButtonSource).toContain('sendButtonGradientColors');
        expect(sendButtonSource).toContain('ActivityIndicator');
        expect(sendButtonSource).toContain('lock-closed');
        expect(sendButtonSource).toContain('paper-plane-outline');
    });
});
