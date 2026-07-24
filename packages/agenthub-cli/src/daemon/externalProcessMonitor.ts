import { readFile } from 'node:fs/promises';

export type ExternalProcessState = 'running' | 'exited';

interface ExternalProcessProbeDependencies {
  platform?: NodeJS.Platform;
  signalProcess?: (pid: number, signal: 0) => void;
  readLinuxStat?: (path: string, encoding: BufferEncoding) => Promise<string>;
}

export function parseLinuxProcessState(stat: string): string | null {
  const closingParen = stat.lastIndexOf(') ');
  if (closingParen < 0) return null;
  const state = stat.slice(closingParen + 2).trimStart().charAt(0);
  return /^[A-Z]$/u.test(state) ? state : null;
}

export async function probeExternalProcessState(
  pid: number,
  dependencies: ExternalProcessProbeDependencies = {},
): Promise<ExternalProcessState> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'exited';

  const signalProcess = dependencies.signalProcess ?? ((targetPid, signal) => process.kill(targetPid, signal));
  try {
    signalProcess(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ESRCH') return 'exited';
    return 'running';
  }

  if ((dependencies.platform ?? process.platform) !== 'linux') return 'running';

  const readLinuxStat = dependencies.readLinuxStat ?? readFile;
  try {
    const stat = await readLinuxStat(`/proc/${pid}/stat`, 'utf8');
    const state = parseLinuxProcessState(stat);
    return state === 'Z' || state === 'X' ? 'exited' : 'running';
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT' ? 'exited' : 'running';
  }
}
