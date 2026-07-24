import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readlink } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

export interface ProcessIdentity {
  pid: number;
  startMarker: string;
  executablePath: string;
  commandDigest: string;
  bootId?: string;
}

export function isSameProcessIdentity(expected: ProcessIdentity, actual: ProcessIdentity | null): boolean {
  return actual !== null && expected.pid === actual.pid &&
    expected.startMarker === actual.startMarker &&
    expected.executablePath === actual.executablePath &&
    expected.commandDigest === actual.commandDigest &&
    (expected.bootId === undefined || actual.bootId === expected.bootId);
}

function digestCommand(command: string | Buffer): string {
  return createHash('sha256').update(command).digest('hex');
}

async function readLinuxIdentity(pid: number): Promise<ProcessIdentity> {
  const [stat, executablePath, command, bootId] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf8'),
    readlink(`/proc/${pid}/exe`),
    readFile(`/proc/${pid}/cmdline`),
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
  ]);
  const closingParen = stat.lastIndexOf(') ');
  if (closingParen < 0) throw new Error('Invalid /proc stat format');
  const fieldsFromState = stat.slice(closingParen + 2).trim().split(/\s+/u);
  const startMarker = fieldsFromState[19]; // /proc stat field 22 (starttime)
  if (!startMarker) throw new Error('Missing process start marker');
  return {
    pid,
    startMarker,
    executablePath,
    commandDigest: digestCommand(command),
    bootId: bootId.trim(),
  };
}

async function readPosixIdentity(pid: number): Promise<ProcessIdentity> {
  const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command=']);
  const output = stdout.trim();
  if (!output) throw new Error('Process not found');
  const match = output.match(/^(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+([\s\S]+)$/u);
  if (!match) throw new Error('Unable to parse process identity');
  const command = match[2];
  return { pid, startMarker: match[1], executablePath: command.split(/\s+/u)[0], commandDigest: digestCommand(command) };
}

export function normalizeWindowsStartMarker(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'value' in value) {
    const stableValue = (value as { value?: unknown }).value;
    if (typeof stableValue === 'string' && stableValue.length > 0) return stableValue;
  }
  throw new Error('Unable to normalize Windows process creation time');
}

async function readWindowsIdentity(pid: number): Promise<ProcessIdentity> {
  const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if(!$p){exit 3}; @($p.CreationDate,$p.ExecutablePath,$p.CommandLine) | ConvertTo-Json -Compress`;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  const [rawStartMarker, executablePath, command] = JSON.parse(stdout.trim()) as unknown[];
  const startMarker = normalizeWindowsStartMarker(rawStartMarker);
  if (typeof executablePath !== 'string' || executablePath.length === 0) {
    throw new Error('Unable to read Windows process executable path');
  }
  const commandText = typeof command === 'string' ? command : '';
  return { pid, startMarker, executablePath, commandDigest: digestCommand(commandText) };
}

export async function readProcessIdentity(pid: number): Promise<ProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'linux') return await readLinuxIdentity(pid);
    if (process.platform === 'win32') return await readWindowsIdentity(pid);
    return await readPosixIdentity(pid);
  } catch {
    return null;
  }
}
