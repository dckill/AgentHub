/**
 * Daemon doctor utilities
 * 
 * Process discovery and cleanup functions for the daemon
 * Helps diagnose and fix issues with hung or orphaned processes
 */

import psList from 'ps-list';
import spawn from 'cross-spawn';
import { projectPath } from '@/projectPath';

type ProcessTreeEntry = {
  pid: number;
  ppid?: number;
};

type AgentHubProcess = {
  pid: number;
  command: string;
  type: string;
};

const DESTRUCTIVE_CLEANUP_TYPES = new Set([
  'daemon',
  'dev-daemon',
  'daemon-spawned-session',
  'dev-daemon-spawned',
  'daemon-version-check',
  'dev-daemon-version-check',
]);

export function isAgentHubProcess(name: string, cmd: string): boolean {
  return name.includes('agenthub') ||
    cmd.includes('agenthub-cli') ||
    cmd.includes('agenthub.mjs') ||
    cmd.includes('agenthub-coder') || // legacy npm package name
    cmd.includes('/agenthub/') ||
    cmd.includes('/cli/bundle/dist/index.mjs') ||
    cmd.includes('\\cli\\bundle\\dist\\index.mjs') ||
    (cmd.includes('tsx') && cmd.includes('src/index.ts') && cmd.includes('agenthub-cli'));
}

export function classifyAgentHubProcess(pid: number, cmd: string, currentPid: number = process.pid): string {
  if (pid === currentPid) {
    return 'current';
  }
  if (cmd.includes('--version')) {
    return cmd.includes('tsx') ? 'dev-daemon-version-check' : 'daemon-version-check';
  }
  if (cmd.includes('daemon start-sync') || cmd.includes('daemon start')) {
    return cmd.includes('tsx') ? 'dev-daemon' : 'daemon';
  }
  if (cmd.includes('--started-by daemon')) {
    return cmd.includes('tsx') ? 'dev-daemon-spawned' : 'daemon-spawned-session';
  }
  if (cmd.includes('doctor')) {
    return cmd.includes('tsx') ? 'dev-doctor' : 'doctor';
  }
  if (cmd.includes('--yolo')) {
    return 'dev-session';
  }
  return cmd.includes('tsx') ? 'dev-related' : 'user-session';
}

export function collectProcessTreePids(processes: ProcessTreeEntry[], rootPid: number): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const proc of processes) {
    if (typeof proc.ppid !== 'number') {
      continue;
    }
    const children = childrenByParent.get(proc.ppid) ?? [];
    children.push(proc.pid);
    childrenByParent.set(proc.ppid, children);
  }

  const result: number[] = [];
  const visit = (pid: number) => {
    for (const childPid of childrenByParent.get(pid) ?? []) {
      visit(childPid);
    }
    result.push(pid);
  };
  visit(rootPid);
  return result;
}

export function filterConfirmedStaleProcesses(
  processes: AgentHubProcess[],
  options: {
    currentPid: number;
    ownedDaemonPid?: number;
    activeSessionPids?: Set<number>;
    projectRoot?: string;
  },
): AgentHubProcess[] {
  return processes.filter((process) => {
    if (process.pid === options.currentPid || process.pid === options.ownedDaemonPid) return false;
    if (!DESTRUCTIVE_CLEANUP_TYPES.has(process.type)) return false;
    if (options.activeSessionPids?.has(process.pid)) return false;
    if (options.projectRoot && !process.command.includes(options.projectRoot)) return false;
    return true;
  });
}

/**
 * Find all AgentHub CLI processes (including current process)
 */
export async function findAllAgentHubProcesses(): Promise<Array<{ pid: number, command: string, type: string }>> {
  try {
    const processes = await psList();
    const allProcesses: Array<{ pid: number, command: string, type: string }> = [];
    
    for (const proc of processes) {
      const cmd = proc.cmd || '';
      const name = proc.name || '';
      
      if (!isAgentHubProcess(name, cmd)) continue;

      const type = classifyAgentHubProcess(proc.pid, cmd);

      allProcesses.push({ pid: proc.pid, command: cmd || name, type });
    }

    return allProcesses;
  } catch (error) {
    return [];
  }
}

/**
 * Find all runaway AgentHub CLI processes that should be killed
 */
export async function findRunawayAgentHubProcesses(): Promise<Array<{ pid: number, command: string }>> {
  const allProcesses = await findAllAgentHubProcesses();
  
  // Filter to just runaway processes (excluding current process)
  return allProcesses
    .filter(p => 
      p.pid !== process.pid && (
        p.type === 'daemon' ||
        p.type === 'dev-daemon' ||
        p.type === 'daemon-spawned-session' ||
        p.type === 'dev-daemon-spawned' ||
        p.type === 'daemon-version-check' ||
        p.type === 'dev-daemon-version-check'
      )
    )
    .map(p => ({ pid: p.pid, command: p.command }));
}

/**
 * Kill all runaway AgentHub CLI processes
 */
export async function killRunawayAgentHubProcesses(): Promise<{ killed: number, errors: Array<{ pid: number, error: string }> }> {
  const [allProcesses, daemonState, activeSessions] = await Promise.all([
    findAllAgentHubProcesses(),
    import('@/persistence').then(({ readDaemonState }) => readDaemonState()),
    import('./controlClient').then(({ listDaemonSessions }) => listDaemonSessions().catch(() => [])),
  ]);
  let ownedDaemonPid: number | undefined;
  if (daemonState?.pid) {
    try {
      process.kill(daemonState.pid, 0);
      ownedDaemonPid = daemonState.pid;
    } catch {
      ownedDaemonPid = undefined;
    }
  }
  const activeSessionPids = new Set<number>(
    activeSessions
      .map((session: { pid?: unknown }) => typeof session.pid === 'number' ? session.pid : undefined)
      .filter((pid): pid is number => pid !== undefined),
  );
  const projectRoot = projectPath();
  const runawayProcesses = filterConfirmedStaleProcesses(allProcesses, {
    currentPid: process.pid,
    ownedDaemonPid,
    activeSessionPids,
    projectRoot,
  });
  const processSnapshot = await psList();
  const errors: Array<{ pid: number, error: string }> = [];
  let killed = 0;
  const attemptedPids = new Set<number>();
  
  for (const { pid, command } of runawayProcesses) {
    const pidsToKill = collectProcessTreePids(processSnapshot, pid);
    for (const pidToKill of pidsToKill) {
      if (pidToKill === process.pid || attemptedPids.has(pidToKill)) {
        continue;
      }
      attemptedPids.add(pidToKill);

      try {
        const label = pidToKill === pid ? command : `child of runaway PID ${pid}`;
        console.log(`Killing runaway process PID ${pidToKill}: ${label}`);

        if (process.platform === 'win32') {
          // Windows: use taskkill; /T includes children.
          const result = spawn.sync('taskkill', ['/F', '/T', '/PID', pidToKill.toString()], { stdio: 'pipe' });
          if (result.error) throw result.error;
          if (result.status !== 0) throw new Error(`taskkill exited with code ${result.status}`);
        } else {
          // Unix: try SIGTERM first
          process.kill(pidToKill, 'SIGTERM');

          // Wait a moment
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check if still alive
          const processes = await psList();
          const stillAlive = processes.find(p => p.pid === pidToKill);
          if (stillAlive) {
            console.log(`Process PID ${pidToKill} ignored SIGTERM, using SIGKILL`);
            process.kill(pidToKill, 'SIGKILL');
          }
        }

        console.log(`Successfully killed runaway process PID ${pidToKill}`);
        killed++;
      } catch (error) {
        const errorMessage = (error as Error).message;
        errors.push({ pid: pidToKill, error: errorMessage });
        console.log(`Failed to kill process PID ${pidToKill}: ${errorMessage}`);
      }
    }
  }

  return { killed, errors };
}
