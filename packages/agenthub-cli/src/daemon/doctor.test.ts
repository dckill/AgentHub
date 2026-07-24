import { describe, expect, it } from 'vitest';
import { classifyAgentHubProcess, collectProcessTreePids, filterConfirmedStaleProcesses, isAgentHubProcess } from './doctor';

describe('daemon doctor process detection', () => {
    it('detects daemon-spawned sessions even when ps-list reports MainThread as the process name', () => {
        const command = 'node --no-warnings --no-deprecation /repo/packages/agenthub-cli/dist/index.mjs codex --agenthub-starting-mode remote --started-by daemon --permission-mode yolo';

        expect(isAgentHubProcess('MainThread', command)).toBe(true);
        expect(classifyAgentHubProcess(1234, command, 9999)).toBe('daemon-spawned-session');
    });

    it('detects the daemon process from the agenthub-cli entrypoint path', () => {
        const command = '/usr/bin/node --no-warnings --no-deprecation /repo/packages/agenthub-cli/dist/index.mjs daemon start-sync';

        expect(isAgentHubProcess('MainThread', command)).toBe(true);
        expect(classifyAgentHubProcess(1234, command, 9999)).toBe('daemon');
    });

    it('detects daemon sessions launched from an environment-private bundle', () => {
        const command = 'node --no-warnings --no-deprecation /repo/environments/data/envs/quiet-star/cli/bundle/dist/index.mjs codex --agenthub-starting-mode remote --started-by daemon';

        expect(isAgentHubProcess('node', command)).toBe(true);
        expect(classifyAgentHubProcess(1234, command, 9999)).toBe('daemon-spawned-session');
    });

    it('collects all descendants before the root for cleanup', () => {
        const processes = [
            { pid: 10, ppid: 1 },
            { pid: 11, ppid: 10 },
            { pid: 12, ppid: 11 },
            { pid: 13, ppid: 10 },
            { pid: 20, ppid: 1 },
        ];

        expect(collectProcessTreePids(processes, 10)).toEqual([12, 11, 13, 10]);
    });

    it('only selects confirmed stale processes for destructive cleanup', () => {
        const processes = [
            { pid: 100, command: '/repo/packages/agenthub-cli/dist/index.mjs daemon start-sync', type: 'daemon' },
            { pid: 101, command: '/repo/packages/agenthub-cli/dist/index.mjs codex --started-by daemon', type: 'daemon-spawned-session' },
            { pid: 102, command: '/repo/packages/agenthub-cli/dist/index.mjs daemon start-sync', type: 'daemon' },
            { pid: 103, command: '/other/environments/data/envs/lab/cli/bundle/dist/index.mjs daemon start-sync', type: 'daemon' },
        ];

        expect(filterConfirmedStaleProcesses(processes, {
            currentPid: 999,
            ownedDaemonPid: 100,
            activeSessionPids: new Set([101]),
            projectRoot: '/repo/packages/agenthub-cli',
        })).toEqual([processes[2]]);
    });
});
