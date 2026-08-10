import { describe, expect, it } from 'vitest';

import { classifyCodexRawItem } from './codexRawItemRouting';

describe('codex raw item routing', () => {
    it('normalizes command execution start and completion payloads', () => {
        expect(classifyCodexRawItem('item/started', {
            type: 'commandExecution',
            id: 'call-1',
            command: ['pnpm', 'test'],
            cwd: '/repo',
        })).toEqual({
            kind: 'command-start',
            callId: 'call-1',
            command: ['pnpm', 'test'],
            cwd: '/repo',
            description: ['pnpm', 'test'],
        });

        expect(classifyCodexRawItem('item/completed', {
            type: 'commandExecution',
            id: 'call-1',
            aggregatedOutput: 'ok',
            exitCode: 0,
            durationMs: 12,
            status: 'completed',
            cwd: '/repo',
            command: ['pnpm', 'test'],
        })).toEqual({
            kind: 'command-complete',
            callId: 'call-1',
            output: 'ok',
            exitCode: 0,
            durationMs: 12,
            status: 'completed',
            cwd: '/repo',
            command: ['pnpm', 'test'],
        });
    });

    it('normalizes file changes and marks terminal statuses for cleanup', () => {
        expect(classifyCodexRawItem('item/started', {
            type: 'fileChange',
            id: 'patch-1',
            changes: [
                { path: 'a.ts', diff: '+a', kind: { type: 'update' } },
                { path: '', diff: 'ignored' },
                null,
            ],
        })).toEqual({
            kind: 'file-start',
            callId: 'patch-1',
            changes: { 'a.ts': { diff: '+a', kind: { type: 'update' } } },
        });

        expect(classifyCodexRawItem('item/completed', {
            type: 'fileChange',
            id: 'patch-1',
            status: 'failed',
        })).toEqual({
            kind: 'file-complete',
            callId: 'patch-1',
            status: 'failed',
            clearChanges: true,
        });
    });

    it('normalizes agent messages and final-answer marker', () => {
        expect(classifyCodexRawItem('item/completed', {
            type: 'agentMessage',
            id: 'agent-1',
            text: 'done',
            phase: 'final_answer',
        })).toEqual({
            kind: 'agent-message',
            itemId: 'agent-1',
            text: 'done',
            phase: 'final_answer',
            isFinalAnswer: true,
        });
    });

    it('fails closed for malformed or unsupported items', () => {
        expect(classifyCodexRawItem('item/started', null)).toEqual({ kind: 'ignored' });
        expect(classifyCodexRawItem('item/started', { type: 'unknown' })).toEqual({ kind: 'ignored' });
        expect(classifyCodexRawItem('turn/completed', { type: 'agentMessage' })).toEqual({ kind: 'ignored' });
    });
});
