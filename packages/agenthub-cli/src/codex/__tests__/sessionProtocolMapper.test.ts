import { describe, expect, it } from 'vitest';
import { createId, isCuid } from '@paralleldrive/cuid2';
import {
    closeCodexTurnWithStatus,
    mapCodexMcpMessageToSessionEnvelopes,
    mapCodexProcessorMessageToSessionEnvelopes,
    mapCodexThreadToSessionEnvelopes,
} from '../utils/sessionProtocolMapper';

describe('mapCodexMcpMessageToSessionEnvelopes', () => {
    it('starts and ends turns for task lifecycle events', () => {
        const started = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'task_started', turn_id: 'provider-turn-1' },
            { currentTurnId: null },
        );

        expect(started.envelopes).toHaveLength(1);
        expect(started.envelopes[0].ev.t).toBe('turn-start');
        expect(started.currentTurnId).toBe('provider-turn-1');
        expect(started.envelopes[0].turn).toBe('provider-turn-1');
        expect(started.envelopes[0].id).toBe('provider-turn-1:start');
        expect(started.envelopes[0].turn).not.toBe(started.envelopes[0].id);

        const ended = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'task_complete', turn_id: 'provider-turn-1' },
            { currentTurnId: started.currentTurnId },
        );
        expect(ended.envelopes).toHaveLength(1);
        expect(ended.envelopes[0].ev.t).toBe('turn-end');
        if (ended.envelopes[0].ev.t === 'turn-end') {
            expect(ended.envelopes[0].ev.status).toBe('completed');
        }
        expect(ended.envelopes[0].turn).toBe(started.currentTurnId);
        expect(ended.envelopes[0].id).toBe('provider-turn-1:end');
        expect(ended.currentTurnId).toBeNull();
    });

    it('maps abort lifecycle with cancelled turn-end status', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'turn_aborted' },
            { currentTurnId: 'turn-1', finalAnswerMessageId: 'answer-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0].ev).toEqual({
            t: 'turn-end',
            status: 'cancelled',
        });
        expect(result.currentTurnId).toBeNull();
    });

    it('closes an active turn as cancelled during runner shutdown', () => {
        const subagent = createId();
        const activeSubagents = new Set<string>([subagent]);
        const startedSubagents = new Set<string>([subagent]);
        const providerSubagentToSessionSubagent = new Map<string, string>([
            ['provider-subagent-1', subagent],
        ]);

        const result = closeCodexTurnWithStatus({
            currentTurnId: 'turn-1',
            activeSubagents,
            startedSubagents,
            providerSubagentToSessionSubagent,
        }, 'cancelled');

        expect(result.envelopes).toHaveLength(2);
        expect(result.envelopes[0]).toMatchObject({
            subagent,
            ev: { t: 'stop' },
        });
        expect(result.envelopes[1].ev).toEqual({
            t: 'turn-end',
            status: 'cancelled',
        });
        expect(result.envelopes[1].turn).toBe('turn-1');
        expect(result.currentTurnId).toBeNull();
        expect(result.activeSubagents.size).toBe(0);
        expect(result.startedSubagents.size).toBe(0);
        expect(result.providerSubagentToSessionSubagent.size).toBe(0);
    });

    it('maps agent text messages with turn context', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'agent_message', message: 'hello', item_id: 'provider-item-1' },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0].id).toBe('provider-item-1');
        expect(result.envelopes[0].turn).toBe('turn-1');
        expect(result.envelopes[0].ev).toEqual({ t: 'text', text: 'hello' });
    });

    it('carries Codex final_answer provenance only onto a completed turn-end', () => {
        const answer = mapCodexMcpMessageToSessionEnvelopes(
            {
                type: 'agent_message',
                message: 'final answer',
                item_id: 'answer-1',
                phase: 'final_answer',
            },
            { currentTurnId: 'turn-1' },
        );

        expect(answer.finalAnswerMessageId).toBe('answer-1');

        const completed = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'task_complete' },
            { currentTurnId: 'turn-1', finalAnswerMessageId: answer.finalAnswerMessageId },
        );
        expect(completed.envelopes.at(-1)?.ev).toEqual({
            t: 'turn-end',
            status: 'completed',
            finalTextId: 'answer-1',
        });
    });

    it('does not carry Codex final_answer provenance onto a failed turn-end', () => {
        const failed = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'task_complete', status: 'failed' },
            { currentTurnId: 'turn-1', finalAnswerMessageId: 'answer-1' },
        );

        expect(failed.envelopes.at(-1)?.ev).toEqual({ t: 'turn-end', status: 'failed' });
    });

    it('maps parent call linkage to subagent field', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'agent_message', message: 'subagent hello', parent_call_id: 'parent-call-1' },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(2);
        const subagent = result.envelopes[1].subagent;
        expect(typeof subagent).toBe('string');
        expect(isCuid(subagent!)).toBe(true);
        expect(result.envelopes[0]).toMatchObject({
            subagent,
            ev: { t: 'start' },
        });
        expect(subagent).not.toBe('parent-call-1');
    });

    it('emits stop for active subagents before turn-end', () => {
        const subagent = createId();
        const activeSubagents = new Set<string>([subagent]);
        const startedSubagents = new Set<string>([subagent]);
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'task_complete' },
            { currentTurnId: 'turn-1', activeSubagents, startedSubagents }
        );

        expect(result.envelopes).toHaveLength(2);
        expect(result.envelopes[0]).toMatchObject({
            subagent,
            ev: { t: 'stop' },
        });
        expect(result.envelopes[1].ev).toEqual({
            t: 'turn-end',
            status: 'completed',
        });
    });

    it('maps exec command begin to tool-call-start', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            {
                type: 'exec_command_begin',
                call_id: 'call-1',
                command: 'ls -la',
                cwd: '/tmp',
            },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        const envelope = result.envelopes[0];
        expect(envelope.ev.t).toBe('tool-call-start');
        if (envelope.ev.t === 'tool-call-start') {
            expect(envelope.ev.call).toBe('call-1');
            expect(envelope.ev.name).toBe('CodexBash');
            expect(envelope.ev.title).toContain('Run `ls -la`');
            expect(envelope.ev.args).toEqual({ command: 'ls -la', cwd: '/tmp' });
        }
    });

    it('maps exec command end output into tool-call result', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            {
                type: 'exec_command_end',
                call_id: 'call-1',
                output: 'hello\n',
                exit_code: 0,
                duration_ms: 42,
                status: 'completed',
            },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0].ev).toEqual({
            t: 'tool-call-end',
            call: 'call-1',
            output: {
                stdout: 'hello\n',
                stderr: '',
                exit_code: 0,
                duration_ms: 42,
                status: 'completed',
            },
        });
    });

    it('marks failed exec command end events as errors', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            {
                type: 'exec_command_end',
                call_id: 'call-1',
                output: 'partial\n',
                error: 'failed',
                exit_code: 2,
                status: 'failed',
            },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes[0].ev).toMatchObject({
            t: 'tool-call-end',
            call: 'call-1',
            isError: true,
            output: {
                stdout: 'partial\n',
                error: 'failed',
                exit_code: 2,
                status: 'failed',
            },
        });
    });

    it('skips token_count messages', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes(
            { type: 'token_count', total_tokens: 10 },
            { currentTurnId: 'turn-1' }
        );

        expect(result.envelopes).toHaveLength(0);
        expect(result.currentTurnId).toBe('turn-1');
    });
});

describe('mapCodexThreadToSessionEnvelopes', () => {
    it('backfills persisted Codex thread turns into session protocol envelopes', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-1',
                startedAt: 100,
                completedAt: 101,
                items: [
                    { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'inspect repo' }] },
                    { type: 'reasoning', id: 'reasoning-1', summary: ['thinking'] },
                    { type: 'commandExecution', id: 'cmd-1', command: 'ls', cwd: '/tmp', aggregatedOutput: 'ok' },
                    { type: 'agentMessage', id: 'agent-1', text: 'done', phase: 'final_answer' },
                ],
            }],
        });

        expect(envelopes.map((envelope) => envelope.ev.t)).toEqual([
            'turn-start',
            'text',
            'text',
            'tool-call-start',
            'text',
            'tool-call-end',
            'text',
            'turn-end',
        ]);
        expect(envelopes[0]).toMatchObject({ role: 'agent', turn: 'turn-1', time: 100_000 });
        expect(envelopes[1]).toMatchObject({ role: 'user', ev: { t: 'text', text: 'inspect repo' } });
        expect(envelopes[2]).toMatchObject({ role: 'agent', turn: 'turn-1', ev: { t: 'text', text: 'thinking', thinking: true } });
        expect(envelopes[7]).toMatchObject({ role: 'agent', turn: 'turn-1', time: 101_000, ev: { t: 'turn-end', status: 'completed' } });
        expect(envelopes[7].ev).toEqual({ t: 'turn-end', status: 'completed', finalTextId: 'agent-1' });
    });

    it('does not guess a historical final answer without final_answer phase', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-no-phase',
                status: 'completed',
                items: [{ type: 'agentMessage', id: 'agent-progress', text: 'partial text' }],
            }],
        });

        expect(envelopes.at(-1)?.ev).toEqual({ t: 'turn-end', status: 'completed' });
    });

    it('does not mark failed historical turns even when a final_answer item exists', () => {
        const envelopes = mapCodexThreadToSessionEnvelopes({
            turns: [{
                id: 'turn-failed',
                status: 'failed',
                items: [{ type: 'agentMessage', id: 'agent-final', text: 'partial text', phase: 'final_answer' }],
            }],
        });

        expect(envelopes.at(-1)?.ev).toEqual({ t: 'turn-end', status: 'failed' });
    });
});

describe('mapCodexProcessorMessageToSessionEnvelopes', () => {
    it('maps reasoning tool lifecycle to start/text/end session events', () => {
        const startEvents = mapCodexProcessorMessageToSessionEnvelopes({
            type: 'tool-call',
            callId: 'reasoning-1',
            name: 'CodexReasoning',
            input: { title: 'Plan changes' },
            id: 'legacy-id-1',
        }, { currentTurnId: 'turn-1' });

        expect(startEvents).toHaveLength(1);
        expect(startEvents[0].ev.t).toBe('tool-call-start');

        const endEvents = mapCodexProcessorMessageToSessionEnvelopes({
            type: 'tool-call-result',
            callId: 'reasoning-1',
            output: { content: 'Step 1, Step 2', status: 'completed' },
            id: 'legacy-id-2',
        }, { currentTurnId: 'turn-1' });

        expect(endEvents).toHaveLength(2);
        expect(endEvents[0].ev.t).toBe('text');
        if (endEvents[0].ev.t === 'text') {
            expect(endEvents[0].ev.thinking).toBe(true);
        }
        expect(endEvents[1].ev).toEqual({ t: 'tool-call-end', call: 'reasoning-1' });
    });

    it('maps reasoning text to thinking text event', () => {
        const events = mapCodexProcessorMessageToSessionEnvelopes({
            type: 'reasoning',
            message: 'Working through options',
            id: 'legacy-id-3',
        }, { currentTurnId: 'turn-1' });

        expect(events).toHaveLength(1);
        expect(events[0].ev).toEqual({
            t: 'text',
            text: 'Working through options',
            thinking: true,
        });
    });
});
