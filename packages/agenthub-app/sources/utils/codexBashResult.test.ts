import { describe, expect, it } from 'vitest';

import { parseCodexBashResult } from './codexBashResult';

describe('codexBashResult', () => {
    it('extracts stdout, stderr, exit code, and duration from structured results', () => {
        expect(parseCodexBashResult({
            state: 'completed',
            startedAt: 1000,
            completedAt: 2250,
            result: {
                stdout: 'done\n',
                stderr: 'warn\n',
                exitCode: 0,
            },
        })).toEqual({
            stdout: 'done\n',
            stderr: 'warn\n',
            error: null,
            exitCode: 0,
            durationMs: 1250,
        });
    });

    it('supports alternate result field names used by codex adapters', () => {
        expect(parseCodexBashResult({
            state: 'error',
            startedAt: null,
            completedAt: null,
            result: {
                output: 'partial',
                error: 'failed',
                exit_code: 2,
            },
        })).toMatchObject({
            stdout: 'partial',
            error: 'failed',
            exitCode: 2,
            durationMs: null,
        });
    });

    it('treats string results as stdout for completed tools and errors for failed tools', () => {
        expect(parseCodexBashResult({
            state: 'completed',
            startedAt: null,
            completedAt: null,
            result: 'plain output',
        }).stdout).toBe('plain output');

        expect(parseCodexBashResult({
            state: 'error',
            startedAt: null,
            completedAt: null,
            result: 'plain error',
        }).error).toBe('plain error');
    });
});
