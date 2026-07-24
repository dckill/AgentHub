import { describe, expect, it } from 'vitest';

import { CHANGE_TITLE_INSTRUCTION } from '@/codex/constants';
import {
    buildCodexMessageModeHash,
    buildCodexTurnPrompt,
    shouldTerminateCodexSessionAfterError,
} from './runCodex';

describe('buildCodexTurnPrompt', () => {
    it('requests a title update for the first user message after resuming an official Codex thread', () => {
        const prompt = buildCodexTurnPrompt('continue from mobile', true);

        expect(prompt).toContain('continue from mobile');
        expect(prompt).toContain(CHANGE_TITLE_INSTRUCTION);
    });

    it('does not request a title update after the first title-eligible turn', () => {
        expect(buildCodexTurnPrompt('follow up', false)).toBe('follow up');
    });
});

describe('buildCodexMessageModeHash', () => {
    it('keeps queued user messages isolated by their client identity', () => {
        const base = { permissionMode: 'default' as const, model: 'gpt-test' };

        expect(buildCodexMessageModeHash({ ...base, clientUserMessageId: 'message-1' }))
            .not.toBe(buildCodexMessageModeHash({ ...base, clientUserMessageId: 'message-2' }));
    });
});

describe('shouldTerminateCodexSessionAfterError', () => {
    it('treats a dead Codex app-server stdin as fatal so the AgentHub session is archived', () => {
        expect(shouldTerminateCodexSessionAfterError(new Error('Cannot send turn/start: stdin not writable'))).toBe(true);
    });

    it('does not terminate the runner for ordinary provider turn failures', () => {
        expect(shouldTerminateCodexSessionAfterError(new Error('model returned validation error'))).toBe(false);
    });
});
