import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  arch,
  cpus,
  freemem,
  hostname,
  platform,
  release,
  totalmem,
  type CpuInfo,
  uptime,
} from 'node:os';
import { promisify } from 'node:util';

import type { RpcSystemMetrics } from '@artsum/agenthub-wire';

const execFileAsync = promisify(execFile);
const KIB = 1024;
const CPU_SAMPLE_DELAY_MS = 120;
const VIRTUAL_POSIX_DEVICES = /^(?:tmpfs|devtmpfs|overlay|squashfs|proc|sysfs|cgroup|cgroup2|nsfs|shm|udev)$/u;

type CpuSample = { idle: number; total: number };
type DiskMetric = RpcSystemMetrics['disks'][number];
type NetworkMetric = RpcSystemMetrics['network'];

const EMPTY_NETWORK_METRIC: NetworkMetric = { receivedBytes: 0, sentBytes: 0 };

function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

function aggregateCpuTimes(items: CpuInfo[]): CpuSample {
  return items.reduce<CpuSample>((result, cpu) => {
    const values = Object.values(cpu.times);
    result.idle += cpu.times.idle;
    result.total += values.reduce((sum, value) => sum + value, 0);
    return result;
  }, { idle: 0, total: 0 });
}

export function calculateCpuUsagePercent(previous: CpuSample, current: CpuSample): number {
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) return 0;
  const idleDelta = Math.max(0, current.idle - previous.idle);
  return clampPercent((1 - idleDelta / totalDelta) * 100);
}

function diskMetric(name: string, mountPoint: string, totalBytes: number, availableBytes: number): DiskMetric {
  const safeTotal = Math.max(0, totalBytes);
  const safeAvailable = Math.min(safeTotal, Math.max(0, availableBytes));
  const usedBytes = safeTotal - safeAvailable;
  return {
    name,
    mountPoint,
    totalBytes: safeTotal,
    usedBytes,
    availableBytes: safeAvailable,
    usagePercent: safeTotal > 0 ? clampPercent((usedBytes / safeTotal) * 100) : 0,
  };
}

export function parsePosixDiskUsage(output: string): DiskMetric[] {
  const seenDevices = new Set<string>();
  const disks: DiskMetric[] = [];
  for (const line of output.split(/\r?\n/u).slice(1)) {
    const match = line.trim().match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(.+)$/u);
    if (!match) continue;
    const [, name, totalKiB, , availableKiB, mountPoint] = match;
    if (VIRTUAL_POSIX_DEVICES.test(name) || seenDevices.has(name)) continue;
    seenDevices.add(name);
    disks.push(diskMetric(name, mountPoint, Number(totalKiB) * KIB, Number(availableKiB) * KIB));
  }
  return disks;
}

export function parseWindowsDiskUsage(output: string): DiskMetric[] {
  const parsed = JSON.parse(output || '[]') as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const name = typeof item.DeviceID === 'string' ? item.DeviceID : '';
    const total = Number(item.Size);
    const available = Number(item.FreeSpace);
    if (!name || !Number.isFinite(total) || !Number.isFinite(available)) return [];
    return [diskMetric(name, `${name}\\`, total, available)];
  });
}

export function parseLinuxNetworkUsage(output: string): NetworkMetric {
  return output.split(/\r?\n/u).reduce<NetworkMetric>((total, line) => {
    const match = line.match(/^\s*([^:]+):\s*(.+)$/u);
    if (!match || match[1].trim() === 'lo') return total;
    const fields = match[2].trim().split(/\s+/u);
    const receivedBytes = Number(fields[0]);
    const sentBytes = Number(fields[8]);
    if (Number.isFinite(receivedBytes) && receivedBytes >= 0) total.receivedBytes += receivedBytes;
    if (Number.isFinite(sentBytes) && sentBytes >= 0) total.sentBytes += sentBytes;
    return total;
  }, { ...EMPTY_NETWORK_METRIC });
}

export function parseDarwinNetworkUsage(output: string): NetworkMetric {
  const lines = output.trim().split(/\r?\n/u);
  const header = lines.shift()?.trim().split(/\s+/u) ?? [];
  const nameIndex = header.indexOf('Name');
  const receivedIndex = header.indexOf('Ibytes');
  const sentIndex = header.indexOf('Obytes');
  if (nameIndex < 0 || receivedIndex < 0 || sentIndex < 0) return { ...EMPTY_NETWORK_METRIC };

  const byInterface = new Map<string, NetworkMetric>();
  for (const line of lines) {
    const fields = line.trim().split(/\s+/u);
    const name = fields[nameIndex];
    if (!name || name === 'lo0') continue;
    const receivedBytes = Number(fields[receivedIndex]);
    const sentBytes = Number(fields[sentIndex]);
    if (!Number.isFinite(receivedBytes) || !Number.isFinite(sentBytes)) continue;
    const current = byInterface.get(name) ?? { ...EMPTY_NETWORK_METRIC };
    byInterface.set(name, {
      receivedBytes: Math.max(current.receivedBytes, receivedBytes),
      sentBytes: Math.max(current.sentBytes, sentBytes),
    });
  }
  return [...byInterface.values()].reduce<NetworkMetric>((total, item) => ({
    receivedBytes: total.receivedBytes + item.receivedBytes,
    sentBytes: total.sentBytes + item.sentBytes,
  }), { ...EMPTY_NETWORK_METRIC });
}

export function parseWindowsNetworkUsage(output: string): NetworkMetric {
  const parsed = JSON.parse(output || '[]') as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.reduce<NetworkMetric>((total, row) => {
    if (!row || typeof row !== 'object') return total;
    const item = row as Record<string, unknown>;
    const receivedBytes = Number(item.ReceivedBytes);
    const sentBytes = Number(item.SentBytes);
    if (Number.isFinite(receivedBytes) && receivedBytes >= 0) total.receivedBytes += receivedBytes;
    if (Number.isFinite(sentBytes) && sentBytes >= 0) total.sentBytes += sentBytes;
    return total;
  }, { ...EMPTY_NETWORK_METRIC });
}

async function readDisks(): Promise<DiskMetric[]> {
  try {
    if (platform() === 'win32') {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress',
      ], { timeout: 2_000, windowsHide: true, maxBuffer: 256 * 1024 });
      return parseWindowsDiskUsage(stdout);
    }
    const { stdout } = await execFileAsync('df', ['-kP'], { timeout: 2_000, maxBuffer: 512 * 1024 });
    return parsePosixDiskUsage(stdout);
  } catch {
    return [];
  }
}

async function readNetwork(): Promise<NetworkMetric> {
  try {
    if (platform() === 'linux') {
      return parseLinuxNetworkUsage(await readFile('/proc/net/dev', 'utf8'));
    }
    if (platform() === 'win32') {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress',
      ], { timeout: 2_000, windowsHide: true, maxBuffer: 256 * 1024 });
      return parseWindowsNetworkUsage(stdout);
    }
    const { stdout } = await execFileAsync('netstat', ['-ibn'], { timeout: 2_000, maxBuffer: 512 * 1024 });
    return parseDarwinNetworkUsage(stdout);
  } catch {
    return { ...EMPTY_NETWORK_METRIC };
  }
}

async function readSystemName(): Promise<string> {
  if (platform() !== 'linux') return `${platform()} ${release()}`;
  try {
    const raw = await readFile('/etc/os-release', 'utf8');
    const prettyName = raw.match(/^PRETTY_NAME=(?:"([^"]+)"|(.+))$/mu);
    return prettyName?.[1] || prettyName?.[2] || `Linux ${release()}`;
  } catch {
    return `Linux ${release()}`;
  }
}

export async function collectSystemMetrics(): Promise<RpcSystemMetrics> {
  const firstCpuSnapshot = cpus();
  const previousCpu = aggregateCpuTimes(firstCpuSnapshot);
  await new Promise((resolve) => setTimeout(resolve, CPU_SAMPLE_DELAY_MS));
  const currentCpuSnapshot = cpus();
  const currentCpu = aggregateCpuTimes(currentCpuSnapshot);
  const totalBytes = totalmem();
  const availableBytes = freemem();
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  const [name, disks, network] = await Promise.all([readSystemName(), readDisks(), readNetwork()]);

  return {
    sampledAt: Date.now(),
    system: {
      platform: platform(),
      name,
      release: release(),
      architecture: arch(),
      hostname: hostname(),
      uptimeSeconds: uptime(),
    },
    cpu: {
      usagePercent: calculateCpuUsagePercent(previousCpu, currentCpu),
      logicalCores: Math.max(1, currentCpuSnapshot.length),
      ...(currentCpuSnapshot[0]?.model ? { model: currentCpuSnapshot[0].model.trim() } : {}),
    },
    memory: {
      totalBytes,
      usedBytes,
      availableBytes,
      usagePercent: totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0,
    },
    network,
    disks,
  };
}
