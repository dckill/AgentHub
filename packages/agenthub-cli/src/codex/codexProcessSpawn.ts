import type { ChildProcess } from 'node:child_process';

export type CodexProcessSpawnOptions = {
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    cwd?: string;
    spawnProcess: (
        command: string,
        args: string[],
        options: {
            stdio: ['pipe', 'pipe', 'pipe'];
            env: NodeJS.ProcessEnv;
            cwd?: string;
            windowsHide: boolean;
        },
    ) => ChildProcess;
};

/** Keep the app-server child-process contract in one cross-platform boundary. */
export function spawnCodexAppServerProcess(options: CodexProcessSpawnOptions): ChildProcess {
    return options.spawnProcess(options.command, options.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: options.env,
        cwd: options.cwd,
        windowsHide: true,
    });
}
