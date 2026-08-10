import { describe, expect, it } from 'vitest';

import { CHANGE_TITLE_INSTRUCTION } from '@/codex/constants';
import {
    buildCodexMessageModeHash,
    buildCodexTurnPrompt,
    shouldTerminateCodexSessionAfterError,
} from './runCodex';

describe('buildCodexTurnPrompt', () => {
    it('requests a title update for the first user message after resuming an official Codex thread', () => {
        const prompt = buildCodexTurnPrompt({
            message: 'continue from mobile',
            appendSystemPrompt: undefined,
            includeAppendSystemPrompt: true,
            includeTitleInstruction: true,
        });

        expect(prompt).toContain('continue from mobile');
        expect(prompt).toContain(CHANGE_TITLE_INSTRUCTION);
    });

    it('does not request a title update after the first title-eligible turn', () => {
        expect(buildCodexTurnPrompt({
            message: 'follow up',
            appendSystemPrompt: undefined,
            includeAppendSystemPrompt: false,
            includeTitleInstruction: false,
        })).toBe('follow up');
    });

    it('injects the App system suffix only once per Codex thread', () => {
        expect(buildCodexTurnPrompt({
            message: 'choose',
            appendSystemPrompt: '<options><option>Yes</option></options>',
            includeAppendSystemPrompt: true,
            includeTitleInstruction: false,
        })).toBe('<options><option>Yes</option></options>\n\nchoose');
    });
});

describe('buildCodexMessageModeHash', () => {
    it('keeps queued user messages isolated by their client identity', () => {
        const base = { permissionMode: 'default' as const, model: 'gpt-test' };

        expect(buildCodexMessageModeHash({ ...base, clientUserMessageId: 'message-1' }))
            .not.toBe(buildCodexMessageModeHash({ ...base, clientUserMessageId: 'message-2' }));
    });

    it('does not batch prompts with different App system suffixes', () => {
        const base = { permissionMode: 'default' as const, clientUserMessageId: 'same-message' };

        expect(buildCodexMessageModeHash({ ...base, appendSystemPrompt: 'options A' }))
            .not.toBe(buildCodexMessageModeHash({ ...base, appendSystemPrompt: 'options B' }));
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
