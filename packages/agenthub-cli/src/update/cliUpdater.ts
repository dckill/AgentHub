import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import process from 'node:process';
import crossSpawn from 'cross-spawn';
import { z } from 'zod';

import type { CliUpdateStatus } from '@artsum/agenthub-wire';
import { configuration } from '@/configuration';
import { projectPath } from '@/projectPath';
import { atomicWritePrivateJson } from '@/utils/atomicPrivateJson';

const PACKAGE_NAME = '@artsum/agenthub';
const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const MAX_INSTALL_OUTPUT_BYTES = 256 * 1024;
const EXACT_SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

export type CliRelease = {
  version: string;
  integrity: string;
};

type UpdateRecord = {
  previousVersion: string;
  targetVersion: string;
  updatedAt: number;
};

export type CliUpdateDependencies = {
  now: () => number;
  fetchRelease: (version?: string) => Promise<CliRelease>;
  installVersion: (version: string) => Promise<void>;
  canInstall: () => { ok: true } | { ok: false; reason: string };
};

export type CliUpdateManagerOptions = {
  currentVersion: string;
  homeDir?: string;
  dependencies?: CliUpdateDependencies;
  onStatus?: (status: CliUpdateStatus) => void | Promise<void>;
};

const registryReleaseSchema = z.object({
  name: z.literal(PACKAGE_NAME),
  version: z.string(),
  dist: z.object({ integrity: z.string().min(1) }),
});

function parseSemver(version: string): ParsedSemver {
  const match = EXACT_SEMVER.exec(version);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) < Number(b) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function normalizeVersion(version: string): string {
  const parsed = parseSemver(version);
  const withoutPrefix = version.startsWith('v') ? version.slice(1) : version;
  void parsed;
  return withoutPrefix;
}

export async function fetchCliRelease(options: {
  version?: string;
  fetchImpl?: typeof fetch;
  registryUrl?: string;
} = {}): Promise<CliRelease> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const registryUrl = (options.registryUrl ?? process.env.AGENTHUB_CLI_REGISTRY_URL ?? DEFAULT_REGISTRY_URL).replace(/\/+$/u, '');
  const requestedVersion = options.version ? normalizeVersion(options.version) : undefined;
  const selector = requestedVersion ?? 'latest';
  const url = `${registryUrl}/${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(selector)}`;
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': `agenthub-cli/${configuration.currentCliVersion}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`CLI release lookup failed: HTTP ${response.status}`);
  const release = registryReleaseSchema.parse(await response.json());
  const actualVersion = normalizeVersion(release.version);
  if (requestedVersion && actualVersion !== requestedVersion) {
    throw new Error(`Registry returned version ${actualVersion} for requested version ${requestedVersion}`);
  }
  return { version: actualVersion, integrity: release.dist.integrity };
}

function defaultInstallCapability(): { ok: true } | { ok: false; reason: string } {
  if (process.env.AGENTHUB_DISABLE_SELF_UPDATE === '1') {
    return { ok: false, reason: 'Self-update is disabled by AGENTHUB_DISABLE_SELF_UPDATE' };
  }
  const root = projectPath();
  if (process.env.AGENTHUB_VARIANT === 'dev' || root.includes(`${sep}packages${sep}agenthub-cli`)) {
    return { ok: false, reason: 'Workspace development installs must be updated from the repository' };
  }
  return { ok: true };
}

function resolveNpmExecutable(): string {
  const configured = process.env.AGENTHUB_NPM_EXECUTABLE;
  if (configured) return configured;
  const sibling = join(dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm');
  return existsSync(sibling) ? sibling : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
}

export async function installCliVersion(version: string): Promise<void> {
  const exactVersion = normalizeVersion(version);
  await new Promise<void>((resolve, reject) => {
    const child = crossSpawn(resolveNpmExecutable(), [
      'install', '--global', '--ignore-scripts', '--no-audit', '--no-fund', `${PACKAGE_NAME}@${exactVersion}`,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, npm_config_loglevel: 'warn' },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      if (outputBytes >= MAX_INSTALL_OUTPUT_BYTES) return;
      const remaining = MAX_INSTALL_OUTPUT_BYTES - outputBytes;
      const value = Buffer.from(chunk).subarray(0, remaining);
      target.push(value);
      outputBytes += value.length;
    };
    child.stdout?.on('data', collect(stdout));
    child.stderr?.on('data', collect(stderr));
    const timer = setTimeout(() => child.kill('SIGTERM'), INSTALL_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const details = Buffer.concat([...stderr, ...stdout]).toString('utf8').trim();
      reject(new Error(`CLI install failed (code=${code}, signal=${signal})${details ? `: ${details}` : ''}`));
    });
  });
}

function defaultDependencies(): CliUpdateDependencies {
  return {
    now: Date.now,
    fetchRelease: (version) => fetchCliRelease({ version }),
    installVersion: installCliVersion,
    canInstall: defaultInstallCapability,
  };
}

export class CliUpdateManager {
  private readonly currentVersion: string;
  private readonly dependencies: CliUpdateDependencies;
  private readonly stateFile: string;
  private readonly onStatus?: (status: CliUpdateStatus) => void | Promise<void>;
  private status: CliUpdateStatus;
  private activeUpdate: Promise<CliUpdateStatus> | null = null;

  constructor(options: CliUpdateManagerOptions) {
    this.currentVersion = normalizeVersion(options.currentVersion);
    this.dependencies = options.dependencies ?? defaultDependencies();
    const homeDir = options.homeDir ?? configuration.agentHubHomeDir;
    this.stateFile = join(homeDir, 'update', 'state.json');
    this.onStatus = options.onStatus;
    const capability = this.dependencies.canInstall();
    this.status = {
      phase: capability.ok ? 'idle' : 'unsupported',
      currentVersion: this.currentVersion,
      updateAvailable: false,
      canUpdate: capability.ok,
      ...(!capability.ok ? { unsupportedReason: capability.reason } : {}),
    };
  }

  getStatus(): CliUpdateStatus {
    return { ...this.status };
  }

  isUpdating(): boolean {
    return this.activeUpdate !== null;
  }

  private publish(status: CliUpdateStatus): CliUpdateStatus {
    this.status = status;
    if (this.onStatus) {
      void Promise.resolve(this.onStatus(this.getStatus())).catch(() => undefined);
    }
    return this.getStatus();
  }

  async check(): Promise<CliUpdateStatus> {
    if (this.activeUpdate) return this.getStatus();
    this.publish({ ...this.status, phase: 'checking', error: undefined });
    try {
      const release = await this.dependencies.fetchRelease();
      const updateAvailable = compareSemver(release.version, this.currentVersion) > 0;
      return this.publish({
        phase: updateAvailable ? 'available' : 'up-to-date',
        currentVersion: this.currentVersion,
        latestVersion: release.version,
        updateAvailable,
        canUpdate: this.status.canUpdate,
        checkedAt: this.dependencies.now(),
        ...(!this.status.canUpdate && this.status.unsupportedReason
          ? { unsupportedReason: this.status.unsupportedReason }
          : {}),
      });
    } catch (error) {
      return this.publish({
        ...this.status,
        phase: 'failed',
        canUpdate: this.status.canUpdate,
        error: error instanceof Error ? error.message.slice(0, 4_096) : String(error).slice(0, 4_096),
        finishedAt: this.dependencies.now(),
      });
    }
  }

  async apply(version?: string): Promise<CliUpdateStatus> {
    return this.applyInternal(version, false);
  }

  private async applyInternal(version: string | undefined, allowDowngrade: boolean): Promise<CliUpdateStatus> {
    if (!this.status.canUpdate) throw new Error(this.status.unsupportedReason ?? 'CLI update is unavailable');
    const release = await this.dependencies.fetchRelease(version);
    if (!allowDowngrade && compareSemver(release.version, this.currentVersion) < 0) {
      throw new Error(`Refusing to downgrade from ${this.currentVersion} to ${release.version}`);
    }
    if (compareSemver(release.version, this.currentVersion) === 0) {
      return this.publish({
        phase: 'up-to-date', currentVersion: this.currentVersion, latestVersion: release.version,
        updateAvailable: false, canUpdate: true, checkedAt: this.dependencies.now(),
      });
    }
    this.publish({
      ...this.status,
      phase: 'updating',
      targetVersion: release.version,
      latestVersion: this.status.latestVersion ?? release.version,
      updateAvailable: compareSemver(release.version, this.currentVersion) > 0,
      canUpdate: true,
      startedAt: this.dependencies.now(),
      error: undefined,
    });
    await this.dependencies.installVersion(release.version);
    mkdirSync(dirname(this.stateFile), { recursive: true, mode: 0o700 });
    const record: UpdateRecord = {
      previousVersion: this.currentVersion,
      targetVersion: release.version,
      updatedAt: this.dependencies.now(),
    };
    atomicWritePrivateJson(this.stateFile, record);
    return this.publish({
      ...this.status,
      phase: 'restarting',
      targetVersion: release.version,
      finishedAt: this.dependencies.now(),
    });
  }

  async requestUpdate(version?: string): Promise<{ accepted: boolean; status: CliUpdateStatus; message?: string }> {
    if (this.activeUpdate) {
      return { accepted: false, status: this.getStatus(), message: 'A CLI update is already running' };
    }
    if (!this.status.canUpdate) {
      return { accepted: false, status: this.getStatus(), message: this.status.unsupportedReason ?? 'CLI update is unavailable' };
    }
    this.activeUpdate = this.applyInternal(version, false)
      .catch((error) => this.publish({
        ...this.status,
        phase: 'failed',
        error: error instanceof Error ? error.message.slice(0, 4_096) : String(error).slice(0, 4_096),
        finishedAt: this.dependencies.now(),
      }))
      .finally(() => { this.activeUpdate = null; });
    return { accepted: true, status: this.getStatus() };
  }

  async rollback(): Promise<CliUpdateStatus> {
    let record: UpdateRecord;
    try {
      record = JSON.parse(readFileSync(this.stateFile, 'utf8')) as UpdateRecord;
    } catch {
      throw new Error('No previous CLI version is available for rollback');
    }
    normalizeVersion(record.previousVersion);
    return this.applyInternal(record.previousVersion, true);
  }

  async requestRollback(): Promise<{ accepted: boolean; status: CliUpdateStatus; message?: string }> {
    if (this.activeUpdate) {
      return { accepted: false, status: this.getStatus(), message: 'A CLI update is already running' };
    }
    if (!this.status.canUpdate) {
      return { accepted: false, status: this.getStatus(), message: this.status.unsupportedReason ?? 'CLI update is unavailable' };
    }
    this.activeUpdate = this.rollback()
      .catch((error) => this.publish({
        ...this.status,
        phase: 'failed',
        error: error instanceof Error ? error.message.slice(0, 4_096) : String(error).slice(0, 4_096),
        finishedAt: this.dependencies.now(),
      }))
      .finally(() => { this.activeUpdate = null; });
    return { accepted: true, status: this.getStatus() };
  }
}
