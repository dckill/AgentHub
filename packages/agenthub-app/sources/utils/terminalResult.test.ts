import { describe, expect, it } from 'vitest';

import { parseBashToolResult, truncateTerminalOutput } from './terminalResult';

describe('terminalResult', () => {
    it('parses structured bash output', () => {
        expect(parseBashToolResult({
            state: 'completed',
            result: { stdout: 'ok\n', stderr: 'warn\n', exitCode: 0 },
            startedAt: 100,
            completedAt: 350,
        })).toEqual({
            stdout: 'ok\n',
            stderr: 'warn\n',
            error: null,
            exitCode: 0,
            durationMs: 250,
        });
    });

    it('treats error strings as errors', () => {
        expect(parseBashToolResult({
            state: 'error',
            result: 'failed',
            startedAt: null,
            completedAt: null,
        }).error).toBe('failed');
    });

    it('parses codex exec command results from structured output', () => {
        expect(parseBashToolResult({
            state: 'completed',
            result: {
                stdout: 'done\n',
                stderr: '',
                exit_code: 0,
                duration_ms: 1200,
                status: 'completed',
            },
            startedAt: null,
            completedAt: null,
        })).toEqual({
            stdout: 'done\n',
            stderr: '',
            error: null,
            exitCode: 0,
            durationMs: 1200,
        });
    });

    it('parses nested aggregated output variants', () => {
        expect(parseBashToolResult({
            state: 'completed',
            result: {
                output: {
                    aggregatedOutput: 'nested output\n',
                    exitCode: 0,
                },
            },
            startedAt: 100,
            completedAt: 250,
        })).toEqual({
            stdout: 'nested output\n',
            stderr: null,
            error: null,
            exitCode: 0,
            durationMs: 150,
        });
    });

    it('truncates long terminal output for compact cards', () => {
        expect(truncateTerminalOutput('abcdef', 4)).toBe('abcd...');
        expect(truncateTerminalOutput('abc', 4)).toBe('abc');
    });
});
