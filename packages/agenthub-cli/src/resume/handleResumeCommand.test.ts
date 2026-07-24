import { describe, expect, it } from 'vitest';

import { buildResumeLaunch, formatResumeHelp, parseResumeCommandArgs } from './handleResumeCommand';

describe('parseResumeCommandArgs', () => {
    it('parses the agenthub session id', () => {
        expect(parseResumeCommandArgs(['cmmij8olq00dp5jcxr3wtbpau'])).toEqual({
            showHelp: false,
            sessionId: 'cmmij8olq00dp5jcxr3wtbpau',
        });
    });

    it('recognizes help flags', () => {
        expect(parseResumeCommandArgs(['--help'])).toEqual({
            showHelp: true,
            sessionId: '',
        });
    });

    it('rejects missing session ids', () => {
        expect(() => parseResumeCommandArgs([])).toThrow(
            'AgentHub session ID is required: agenthub resume <session-id>',
        );
    });
});

describe('buildResumeLaunch', () => {
    it('builds a Codex resume command', () => {
        expect(buildResumeLaunch({
            id: 'session-1',
            active: false,
            metadata: {
                path: '/tmp/p1-control-flow',
                flavor: 'codex',
                codexThreadId: '019ccca5-726b-7c61-b914-16de27dfab6e',
                host: 'localhost',
                homeDir: '/tmp',
                agentHubHomeDir: '/tmp/.agenthub',
                agentHubLibDir: '/tmp/agenthub',
                agentHubToolsDir: '/tmp/agenthub/tools',
            },
        })).toEqual({
            cwd: '/tmp/p1-control-flow',
            args: ['codex', '--resume', '019ccca5-726b-7c61-b914-16de27dfab6e'],
        });
    });

    it('builds a Claude resume command', () => {
        expect(buildResumeLaunch({
            id: 'session-2',
            active: false,
            metadata: {
                path: '/tmp/repo',
                flavor: 'claude',
                claudeSessionId: '93a9705e-bc6a-406d-8dce-8acc014dedbd',
                host: 'localhost',
                homeDir: '/tmp',
                agentHubHomeDir: '/tmp/.agenthub',
                agentHubLibDir: '/tmp/agenthub',
                agentHubToolsDir: '/tmp/agenthub/tools',
            },
        })).toEqual({
            cwd: '/tmp/repo',
            args: ['claude', '--resume', '93a9705e-bc6a-406d-8dce-8acc014dedbd'],
        });
    });

    it('rejects unsupported flavors', () => {
        expect(() => buildResumeLaunch({
            id: 'session-3',
            active: false,
            metadata: {
                path: '/tmp/repo',
                flavor: 'legacy-provider',
                host: 'localhost',
                homeDir: '/tmp',
                agentHubHomeDir: '/tmp/.agenthub',
                agentHubLibDir: '/tmp/agenthub',
                agentHubToolsDir: '/tmp/agenthub/tools',
            },
        })).toThrow('AgentHub session session-3 uses unsupported flavor "legacy-provider".');
    });
});

describe('formatResumeHelp', () => {
    it('mentions the session id command shape', () => {
        expect(formatResumeHelp()).toContain('agenthub resume <agenthub-session-id>');
    });
});
