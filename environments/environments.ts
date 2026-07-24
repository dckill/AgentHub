import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import * as crypto from "crypto";
import { execSync, spawn, spawnSync } from "child_process";
import { pathToFileURL } from "url";

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENVIRONMENTS_ROOT = path.join(REPO_ROOT, "environments");
const ENVIRONMENTS_DATA_DIR = path.join(ENVIRONMENTS_ROOT, "data");
const ENVIRONMENTS_DIR = path.join(ENVIRONMENTS_DATA_DIR, "envs");
const CURRENT_ENV_PATH = path.join(ENVIRONMENTS_DATA_DIR, "current.json");
const LAB_RAT_PROJECT_TEMPLATE_DIR = path.join(ENVIRONMENTS_ROOT, "lab-rat-todo-project");
const DEFAULT_EXPO_PORT = 19007;
const AGENTHUB_CLI_PACKAGE_DIR = path.join(REPO_ROOT, "packages", "agenthub-cli");
const AGENTHUB_CLI_PACKAGE_JSON = path.join(AGENTHUB_CLI_PACKAGE_DIR, "package.json");
const AGENTHUB_CLI_TSCONFIG = path.join(AGENTHUB_CLI_PACKAGE_DIR, "tsconfig.json");
const SERVICE_SUPERVISOR_PATH = path.join(ENVIRONMENTS_ROOT, "serviceSupervisor.ts");
const DEFAULT_ENVIRONMENT_LOG_MAX_FILES = 20;
const DEFAULT_ENVIRONMENT_LOG_MAX_BYTES = 1024 * 1024;

/**
 * Resolve all authenticated-environment CLI runtime files below the environment
 * directory.  Keeping this separate from the repository package prevents an
 * environment build from replacing the bundle used by the systemd daemon.
 */
export function getEnvironmentCliBundleRoot(envDir: string): string {
    return path.join(envDir, "cli", "bundle");
}

export function getEnvironmentCliEntrypoint(envDir: string): string {
    return path.join(getEnvironmentCliBundleRoot(envDir), "dist", "index.mjs");
}

function getEnvironmentCliLauncher(envDir: string): string {
    return path.join(getEnvironmentCliBundleRoot(envDir), "bin", "agenthub.mjs");
}

function linkOrCopyDirectory(source: string, target: string): void {
    try {
        fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
    } catch {
        // Windows environments without symlink privileges still get an
        // isolated copy.  Linux/macOS normally take the cheap read-only link.
        fs.cpSync(source, target, { recursive: true });
    }
}

function preparePrivateCliNodeModules(stagingRoot: string): void {
    const target = path.join(stagingRoot, "node_modules");
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });

    // Link the repository dependency tree entry-by-entry.  A single symlink to
    // root node_modules would preserve pnpm's broken workspace-relative
    // @artsum link; absolute links keep every external package resolvable while
    // avoiding a multi-gigabyte copy per environment.
    const rootNodeModules = path.join(REPO_ROOT, "node_modules");
    for (const entry of fs.readdirSync(rootNodeModules)) {
        if (entry === "@artsum") continue;
        const source = path.join(rootNodeModules, entry);
        const destination = path.join(target, entry);
        try {
            const resolved = fs.realpathSync(source);
            try {
                fs.symlinkSync(
                    resolved,
                    destination,
                    fs.statSync(resolved).isDirectory() && process.platform === "win32" ? "junction" : "dir",
                );
            } catch {
                // Symlink privileges can be disabled on Windows; copy only the
                // missing dependency as a correctness fallback.
                fs.cpSync(resolved, destination, { recursive: true });
            }
        } catch {
            // Broken optional links in a developer checkout are not required by
            // the bundled CLI and should not abort private environment startup.
        }
    }

    const artsumTarget = path.join(target, "@artsum");
    fs.mkdirSync(artsumTarget, { recursive: true, mode: 0o700 });
    const wireSource = path.join(REPO_ROOT, "packages", "agenthub-wire");
    linkOrCopyDirectory(fs.realpathSync(wireSource), path.join(artsumTarget, "agenthub-wire"));

    // A package-local workspace dependency may be present under a different
    // pnpm layout; prefer it when it resolves, but always land on an absolute
    // path under this repository.
    const localWire = path.join(AGENTHUB_CLI_PACKAGE_DIR, "node_modules", "@artsum", "agenthub-wire");
    if (fs.existsSync(localWire)) {
        fs.unlinkSync(path.join(artsumTarget, "agenthub-wire"));
        linkOrCopyDirectory(fs.realpathSync(localWire), path.join(artsumTarget, "agenthub-wire"));
    }
}

function preparePrivateCliBuildContext(stagingRoot: string): void {
    fs.mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    fs.copyFileSync(AGENTHUB_CLI_PACKAGE_JSON, path.join(stagingRoot, "package.json"));
    fs.chmodSync(path.join(stagingRoot, "package.json"), 0o600);

    // pkgroll resolves package entry points from ./src and TypeScript from the
    // package tsconfig.  The source remains read-only in the repository while
    // all generated dist files are written into this environment staging tree.
    linkOrCopyDirectory(path.join(AGENTHUB_CLI_PACKAGE_DIR, "src"), path.join(stagingRoot, "src"));
    fs.copyFileSync(AGENTHUB_CLI_TSCONFIG, path.join(stagingRoot, "tsconfig.json"));
    // Use the CLI package's dependency tree rather than the repository root
    // tree: pnpm workspace links (notably @artsum/agenthub-wire) are relative
    // to packages/agenthub-cli/node_modules and become broken when relocated.
    preparePrivateCliNodeModules(stagingRoot);

    // projectPath() is used by runners for MCP, hooks and bundled helper tools.
    // These support files are linked into the isolated root so those paths keep
    // working without duplicating the large platform-tool archives per env.
    // The bin launchers compute their project root from their own physical
    // location.  They must be copied (not symlinked), otherwise Node resolves
    // the symlink back to packages/agenthub-cli and starts the shared daemon
    // bundle.  Scripts/tools are read-only support trees and can stay linked.
    fs.cpSync(path.join(AGENTHUB_CLI_PACKAGE_DIR, "bin"), path.join(stagingRoot, "bin"), { recursive: true });
    for (const directory of ["scripts", "tools"] as const) {
        linkOrCopyDirectory(
            path.join(AGENTHUB_CLI_PACKAGE_DIR, directory),
            path.join(stagingRoot, directory),
        );
    }
}

type PrivateCliBuildSpawnOptions = {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: "inherit";
};

type PrivateCliBuildRunner = (
    command: string,
    args: string[],
    options: PrivateCliBuildSpawnOptions,
) => { status: number | null };

/**
 * Build an authenticated environment's CLI without touching the shared
 * packages/agenthub-cli/dist directory.  The replacement is staged and then
 * atomically renamed; a failed build leaves an existing bundle untouched.
 */
export function buildPrivateCliBundle(
    envDir: string,
    options: { run?: PrivateCliBuildRunner } = {},
): string {
    const cliDir = path.join(envDir, "cli");
    const bundleRoot = getEnvironmentCliBundleRoot(envDir);
    const stagingRoot = path.join(cliDir, `.bundle-build-${process.pid}-${crypto.randomUUID()}`);
    const previousRoot = path.join(cliDir, `.bundle-previous-${process.pid}-${crypto.randomUUID()}`);

    fs.mkdirSync(cliDir, { recursive: true, mode: 0o700 });
    const run = options.run ?? ((command, args, spawnOptions) => spawnSync(command, args, spawnOptions));
    try {
        // Typecheck against the repository package first; this never removes or
        // writes the production dist directory.
        const typecheck = run(resolveRepositoryBinary("tsc", { packageRoot: AGENTHUB_CLI_PACKAGE_DIR }), ["--noEmit", "-p", AGENTHUB_CLI_TSCONFIG], {
            cwd: AGENTHUB_CLI_PACKAGE_DIR,
            env: process.env,
            stdio: "inherit",
        });
        if (typecheck.status !== 0) {
            throw new Error(`CLI typecheck failed with exit code ${typecheck.status ?? "unknown"}`);
        }

        preparePrivateCliBuildContext(stagingRoot);
        const bundle = run(resolveRepositoryBinary("pkgroll", { packageRoot: AGENTHUB_CLI_PACKAGE_DIR }), ["--clean-dist"], {
            cwd: stagingRoot,
            env: process.env,
            stdio: "inherit",
        });
        if (bundle.status !== 0 || !fs.existsSync(path.join(stagingRoot, "dist", "index.mjs"))) {
            throw new Error(`Private CLI bundle failed with exit code ${bundle.status ?? "unknown"}`);
        }

        let movedPrevious = false;
        if (fs.existsSync(bundleRoot)) {
            fs.renameSync(bundleRoot, previousRoot);
            movedPrevious = true;
        }
        try {
            fs.renameSync(stagingRoot, bundleRoot);
        } catch (error) {
            if (movedPrevious && !fs.existsSync(bundleRoot)) {
                fs.renameSync(previousRoot, bundleRoot);
            }
            throw error;
        }
        if (movedPrevious) {
            fs.rmSync(previousRoot, { recursive: true, force: true });
        }

        return bundleRoot;
    } catch (error) {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        throw error;
    }
}

export function resolveRepositoryBinary(
    binary: string,
    options: {
        platform?: string;
        packageRoot?: string;
        exists?: (candidate: string) => boolean;
    } = {},
): string {
    const platform = options.platform ?? process.platform;
    const suffix = platform === "win32" ? ".cmd" : "";
    const exists = options.exists ?? fs.existsSync;
    const roots = options.packageRoot ? [options.packageRoot, REPO_ROOT] : [REPO_ROOT];
    for (const root of roots) {
        const candidate = path.join(root, "node_modules", ".bin", `${binary}${suffix}`);
        if (exists(candidate)) return candidate;
    }
    return binary;
}

export function resolveRepositoryPackageManager(options: {
    exists?: (candidate: string) => boolean;
    execPath?: string;
    pathLookup?: (binary: string) => string | undefined;
} = {}): { command: string; argsPrefix: string[] } {
    const exists = options.exists ?? fs.existsSync;
    const localPnpm = path.join(REPO_ROOT, "node_modules", ".bin", `pnpm${process.platform === "win32" ? ".cmd" : ""}`);
    if (exists(localPnpm)) {
        return { command: localPnpm, argsPrefix: [] };
    }

    const pathLookup = options.pathLookup ?? ((binary: string): string | undefined => {
        const lookupCommand = process.platform === "win32" ? "where" : "which";
        const result = spawnSync(lookupCommand, [binary], {
            env: process.env,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        if (result.status !== 0 || typeof result.stdout !== "string") return undefined;
        return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    });
    const pathPnpm = pathLookup("pnpm");
    if (pathPnpm) {
        return { command: pathPnpm, argsPrefix: [] };
    }

    const execPath = options.execPath ?? process.execPath;
    const npxCandidate = path.join(path.dirname(execPath), process.platform === "win32" ? "npx.cmd" : "npx");
    return {
        command: exists(npxCandidate) ? npxCandidate : "npx",
        argsPrefix: ["--yes", "pnpm@10.11.0"],
    };
}

// ============================================================================
// Name generation (expanded from packages/agenthub-app/sources/utils/generateWorktreeName.ts)
// ============================================================================

const adjectives = [
    "clever", "agenthub", "swift", "bright", "calm",
    "bold", "quiet", "brave", "wise", "eager",
    "gentle", "quick", "sharp", "smooth", "fresh",
    "warm", "cool", "vivid", "lucid", "nimble",
    "keen", "fair", "grand", "sleek", "merry",
    "noble", "agile", "witty", "crisp", "snug",
    "jolly", "lush", "deft", "tidy", "stout",
    "plush", "brisk", "prime", "true", "zesty",
];

const nouns = [
    "ocean", "forest", "cloud", "star", "river",
    "mountain", "valley", "bridge", "beacon", "harbor",
    "garden", "meadow", "canyon", "island", "desert",
    "glacier", "aurora", "lagoon", "summit", "prairie",
    "reef", "grove", "delta", "ridge", "oasis",
    "crater", "fjord", "marsh", "bluff", "dune",
    "spring", "atlas", "comet", "ember", "frost",
    "pearl", "cedar", "maple", "birch", "coral",
];

function randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

function generateName(): string {
    return `${randomChoice(adjectives)}-${randomChoice(nouns)}`;
}

// ============================================================================
// Port allocation
// ============================================================================

function allocatePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
                server.close();
                reject(new Error("Failed to allocate port"));
                return;
            }
            const port = addr.port;
            server.close(() => resolve(port));
        });
        server.on("error", reject);
    });
}

async function allocatePreferredPort(preferredPort: number): Promise<number> {
    if (!isPortInUse(preferredPort)) {
        return preferredPort;
    }
    throw new Error(`Preferred port ${preferredPort} is already in use.`);
}

// ============================================================================
// Types
// ============================================================================

export interface EnvironmentConfig {
    name: string;
    serverPort: number;
    expoPort: number;
    createdAt: string;
    template: string;
    projectTemplate: string;
    projectPath: string;
    authenticatedWebUrl?: string;
    cliCommand?: string;
}

interface CurrentConfig {
    current: string;
}

// ============================================================================
// Helpers
// ============================================================================

function ensureEnvironmentsDir() {
    fs.mkdirSync(ENVIRONMENTS_DIR, { recursive: true });
}

function readCurrentConfig(): CurrentConfig | null {
    if (!fs.existsSync(CURRENT_ENV_PATH)) return null;
    return JSON.parse(fs.readFileSync(CURRENT_ENV_PATH, "utf-8"));
}

function writeCurrentConfig(current: string) {
    fs.mkdirSync(ENVIRONMENTS_DATA_DIR, { recursive: true });
    fs.writeFileSync(CURRENT_ENV_PATH, JSON.stringify({ current }, null, 4) + "\n");
}

function readEnvironmentConfig(name: string): EnvironmentConfig {
    const configPath = path.join(ENVIRONMENTS_DIR, name, "environment.json");
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export interface EnvironmentHealth {
    envDir: string;
    configPresent: boolean;
    issues: string[];
    stalePidFiles: string[];
}

export function inspectEnvironmentHealth(envDir: string, processAlive: (pid: number) => boolean = isProcessAlive): EnvironmentHealth {
    const issues: string[] = [];
    const stalePidFiles: string[] = [];
    const configPath = path.join(envDir, "environment.json");
    const configPresent = fs.existsSync(configPath);
    if (!configPresent) issues.push("missing environment.json");
    else {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<EnvironmentConfig>;
            if (!config.name || config.name !== path.basename(envDir)) issues.push("environment name mismatch");
            if (!Number.isInteger(config.serverPort) || !Number.isInteger(config.expoPort)) issues.push("invalid service ports");
        } catch { issues.push("invalid environment.json"); }
    }
    const pidsDir = path.join(envDir, "pids");
    if (fs.existsSync(pidsDir)) {
        for (const file of fs.readdirSync(pidsDir).filter((entry) => entry.endsWith(".pid"))) {
            const pidPath = path.join(pidsDir, file);
            const raw = fs.readFileSync(pidPath, "utf8").trim();
            const pid = Number(raw);
            if (!Number.isInteger(pid) || pid <= 0 || !processAlive(pid)) {
                stalePidFiles.push(file);
                issues.push(`stale pid file: ${file}`);
            }
        }
    }
    return { envDir, configPresent, issues, stalePidFiles };
}

export function selectPrunableEnvironments(
    environments: Array<{ name: string; health: EnvironmentHealth }>,
    currentName?: string,
): string[] {
    return environments
        .filter(({ name, health }) => name !== currentName && health.issues.length > 0 && health.stalePidFiles.length > 0)
        .map(({ name }) => name)
        .sort();
}

export function rotateEnvironmentLogs(logDir: string, options: { maxFiles?: number; maxBytes?: number } = {}): string[] {
    const maxFiles = options.maxFiles ?? 20;
    const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
    if (!Number.isInteger(maxFiles) || maxFiles < 0) {
        throw new RangeError(`maxFiles must be a non-negative integer (received ${maxFiles})`);
    }
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
        throw new RangeError(`maxBytes must be a non-negative finite number (received ${maxBytes})`);
    }
    if (!fs.existsSync(logDir)) return [];
    const files = fs.readdirSync(logDir).map((name) => {
        const filePath = path.join(logDir, name);
        try { const stat = fs.statSync(filePath); return stat.isFile() ? { name, filePath, size: stat.size, mtimeMs: stat.mtimeMs } : null; } catch { return null; }
    }).filter((entry): entry is { name: string; filePath: string; size: number; mtimeMs: number } => Boolean(entry)).sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
    const removed: string[] = [];
    let total = files.reduce((sum, file) => sum + file.size, 0);
    while (files.length - removed.length > maxFiles || total > maxBytes) {
        const candidate = files[removed.length];
        if (!candidate) break;
        try { fs.unlinkSync(candidate.filePath); removed.push(candidate.name); total -= candidate.size; } catch { break; }
    }
    return removed;
}

function writeEnvironmentConfig(config: EnvironmentConfig) {
    const envDir = path.join(ENVIRONMENTS_DIR, config.name);
    const configPath = path.join(ENVIRONMENTS_DIR, config.name, "environment.json");
    fs.writeFileSync(
        configPath,
        JSON.stringify({ ...config, cliCommand: buildCliCommand(envDir) }, null, 4) + "\n"
    );
    fs.writeFileSync(
        path.join(envDir, "env.sh"),
        buildEnvSh(config.name, envDir, config.serverPort, config.expoPort),
    );
    writeEnvCommands(envDir);
}

function listEnvironments(): string[] {
    if (!fs.existsSync(ENVIRONMENTS_DIR)) return [];
    return fs.readdirSync(ENVIRONMENTS_DIR).filter(entry => {
        const envJsonPath = path.join(ENVIRONMENTS_DIR, entry, "environment.json");
        return fs.existsSync(envJsonPath);
    });
}

function ensureLabRatProjectTemplate() {
    if (!fs.existsSync(LAB_RAT_PROJECT_TEMPLATE_DIR)) {
        throw new Error(`Missing lab-rat project template at ${LAB_RAT_PROJECT_TEMPLATE_DIR}`);
    }
}

function copyLabRatProject(envDir: string): string {
    ensureLabRatProjectTemplate();
    const targetDir = path.join(envDir, "project");
    fs.cpSync(LAB_RAT_PROJECT_TEMPLATE_DIR, targetDir, { recursive: true });
    return targetDir;
}

function isPortInUse(port: number): boolean {
    try {
        const result = execSync(`lsof -i tcp:${port} -sTCP:LISTEN -t 2>/dev/null`, { encoding: "utf-8" });
        return result.trim().length > 0;
    } catch {
        return false;
    }
}

function readDevAuth(envDir: string): { secret: string; token: string } | null {
    const accessKeyPath = path.join(envDir, "cli", "home", "access.key");
    if (!fs.existsSync(accessKeyPath)) {
        return null;
    }

    try {
        const credentials = JSON.parse(fs.readFileSync(accessKeyPath, "utf-8")) as {
            secret?: string;
            token?: string;
        };

        if (!credentials.secret || !credentials.token) {
            return null;
        }

        return {
            token: credentials.token,
            secret: Buffer.from(credentials.secret, "base64").toString("base64url"),
        };
    } catch {
        return null;
    }
}

// ============================================================================
// PID file management
// ============================================================================

function writePidFile(envDir: string, service: string, pid: number): void {
    const pidsDir = path.join(envDir, "pids");
    fs.mkdirSync(pidsDir, { recursive: true });
    fs.writeFileSync(path.join(pidsDir, `${service}.pid`), String(pid));
}

function readPidFile(envDir: string, service: string): number | null {
    const pidPath = path.join(envDir, "pids", `${service}.pid`);
    if (!fs.existsSync(pidPath)) return null;
    const raw = fs.readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
}

function removePidFile(envDir: string, service: string): void {
    const pidPath = path.join(envDir, "pids", `${service}.pid`);
    try { fs.unlinkSync(pidPath); } catch {}
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * Wait synchronously for a detached environment process to leave the process
 * table before its state directory is removed.  The callback is injectable so
 * the bounded behavior can be tested without spawning a real process.
 */
export function waitForProcessExit(
    pid: number,
    timeoutMs = 3_000,
    pollMs = 50,
    isAlive: (pid: number) => boolean = isProcessAlive,
): boolean {
    const startedAt = Date.now();
    const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
    while (Date.now() - startedAt < timeoutMs) {
        if (!isAlive(pid)) return true;
        Atomics.wait(waitBuffer, 0, 0, pollMs);
    }
    return !isAlive(pid);
}

function killProcess(pid: number): void {
    let exited = false;
    try {
        // Kill entire process group (detached processes get their own group)
        process.kill(-pid, "SIGTERM");
    } catch {
        try { process.kill(pid, "SIGTERM"); } catch {}
    }
    exited = waitForProcessExit(pid);
    if (exited) return;

    // Environment teardown is bounded: only after the SIGTERM grace period
    // expires do we force-kill the detached test/service group. Production
    // systemd daemon lifecycle never calls this helper.
    try {
        process.kill(-pid, "SIGKILL");
    } catch {
        try { process.kill(pid, "SIGKILL"); } catch {}
    }
    waitForProcessExit(pid, 1_000, 25);
}

type EnvironmentDaemonCommandResult = {
    status: number | null;
    stdout?: string;
};

type EnvironmentDaemonCommandRunner = (
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; encoding: "utf8"; timeout?: number },
) => EnvironmentDaemonCommandResult;

/**
 * Ask an isolated daemon to stop every session before its own process is
 * terminated. Runners are detached process groups and can otherwise survive
 * daemon teardown as PID-1 children. This helper is intentionally scoped to
 * an environment-local launcher; production systemd daemon state never calls
 * it.
 */
export function stopEnvironmentDaemonSessions(
    envDir: string,
    options: { run?: EnvironmentDaemonCommandRunner; waitTimeoutMs?: number; pollMs?: number } = {},
): number {
    const launcher = getEnvironmentCliLauncher(envDir);
    if (!fs.existsSync(launcher)) return 0;

    let config: Pick<EnvironmentConfig, "serverPort" | "expoPort">;
    try {
        config = JSON.parse(fs.readFileSync(path.join(envDir, "environment.json"), "utf8")) as Pick<EnvironmentConfig, "serverPort" | "expoPort">;
    } catch {
        return 0;
    }

    const env = { ...process.env, ...buildEnvVars(envDir, config.serverPort, config.expoPort) };
    const run = options.run ?? ((command, args, runOptions) => spawnSync(command, args, {
        cwd: envDir,
        env,
        encoding: runOptions.encoding,
        timeout: runOptions.timeout,
        stdio: ['ignore', 'pipe', 'ignore'],
    }));
    const runCommand = (args: string[]) => run(process.execPath, [launcher, ...args], {
        cwd: envDir,
        env,
        encoding: "utf8",
        timeout: 5_000,
    });

    let listed: EnvironmentDaemonCommandResult;
    try {
        listed = runCommand(["daemon", "list"]);
    } catch {
        return 0;
    }
    if (listed.status !== 0 || !listed.stdout) return 0;

    const jsonStart = listed.stdout.indexOf("[");
    if (jsonStart < 0) return 0;

    let sessions: Array<{ agentHubSessionId?: unknown }>;
    try {
        const parsed = JSON.parse(listed.stdout.slice(jsonStart)) as unknown;
        sessions = Array.isArray(parsed) ? parsed.filter((item): item is { agentHubSessionId?: unknown } => Boolean(item && typeof item === "object")) : [];
    } catch {
        return 0;
    }

    let stopped = 0;
    for (const session of sessions) {
        if (typeof session.agentHubSessionId !== "string" || session.agentHubSessionId.length === 0) continue;
        try {
            const result = runCommand(["daemon", "stop-session", session.agentHubSessionId]);
            if (result.status === 0) stopped += 1;
        } catch {
            // Continue stopping the remaining isolated sessions.
        }
    }

    const deadline = Date.now() + (options.waitTimeoutMs ?? 3_000);
    const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
    while (Date.now() < deadline) {
        let remaining: Array<{ agentHubSessionId?: unknown }> = [];
        try {
            const current = runCommand(["daemon", "list"]);
            if (current.status !== 0 || !current.stdout) break;
            const currentStart = current.stdout.indexOf("[");
            if (currentStart >= 0) {
                const parsed = JSON.parse(current.stdout.slice(currentStart)) as unknown;
                remaining = Array.isArray(parsed) ? parsed.filter((item): item is { agentHubSessionId?: unknown } => Boolean(item && typeof item === "object")) : [];
            }
        } catch {
            break;
        }
        if (remaining.length === 0) break;
        Atomics.wait(waitBuffer, 0, 0, options.pollMs ?? 100);
    }
    return stopped;
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try { if (await check()) return; } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

export function spawnManagedEnvironmentService(
    command: string,
    args: string[],
    opts: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        logFile: string;
        maxFiles?: number;
        maxBytes?: number;
    },
): number {
    fs.mkdirSync(path.dirname(opts.logFile), { recursive: true });
    const maxFiles = opts.maxFiles ?? DEFAULT_ENVIRONMENT_LOG_MAX_FILES;
    const maxBytes = opts.maxBytes ?? DEFAULT_ENVIRONMENT_LOG_MAX_BYTES;
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new RangeError("maxFiles must be a positive integer");
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError("maxBytes must be a positive integer");
    const encodedConfig = Buffer.from(JSON.stringify({ command, args, logFile: opts.logFile, maxFiles, maxBytes })).toString("base64url");
    const child = spawn(resolveRepositoryBinary("tsx"), [SERVICE_SUPERVISOR_PATH, encodedConfig], {
        cwd: opts.cwd,
        env: opts.env,
        stdio: "ignore",
        detached: true,
    });
    child.unref();
    return child.pid!;
}

/**
 * Keep environment-managed Expo sessions non-interactive.  Expo's default
 * Fusebox/DevTools bootstrap launches a local Chrome sandbox on Linux, which
 * is unavailable in many CI and authenticated-dev hosts.  Respect an
 * explicit override for local debugging while defaulting to the supported
 * headless mode.
 */
export function buildWebServiceEnv(
    env: Record<string, string | undefined>,
): Record<string, string | undefined> {
    return {
        ...env,
        BROWSER: "none",
        EXPO_UNSTABLE_HEADLESS: env.EXPO_UNSTABLE_HEADLESS ?? "true",
    };
}

export const DEFAULT_WEB_STARTUP_TIMEOUT_MS = 120_000;

export function getWebStartupTimeoutMs(env: Record<string, string | undefined>): number {
    const configured = Number(env.AGENTHUB_ENV_WEB_STARTUP_TIMEOUT_MS);
    return Number.isFinite(configured) && configured >= 1_000
        ? configured
        : DEFAULT_WEB_STARTUP_TIMEOUT_MS;
}

export const VALID_TEMPLATES = ["authenticated-empty", "empty"] as const;
export type Template = (typeof VALID_TEMPLATES)[number];

export function getEnvironmentDir(name: string): string {
    return path.join(ENVIRONMENTS_DIR, name);
}

export function getEnvironmentConfig(name: string): EnvironmentConfig {
    return readEnvironmentConfig(name);
}

export function setEnvironmentTemplate(name: string, template: Template): void {
    const config = readEnvironmentConfig(name);
    writeEnvironmentConfig({ ...config, template });
}

export async function createEnvironment(opts?: { noSwitch?: boolean }): Promise<string> {
    ensureEnvironmentsDir();

    const existing = new Set(listEnvironments());
    let name = generateName();
    let attempts = 0;
    while (existing.has(name) && attempts < 100) {
        name = generateName();
        attempts++;
    }
    if (existing.has(name)) {
        throw new Error("Failed to generate a unique environment name after 100 attempts.");
    }

    const serverPort = await allocatePort();
    const requestedExpoPort = process.env.AGENTHUB_ENV_EXPO_PORT
        ? parseInt(process.env.AGENTHUB_ENV_EXPO_PORT, 10)
        : DEFAULT_EXPO_PORT;
    const expoPort = Number.isFinite(requestedExpoPort) && requestedExpoPort > 0
        ? await allocatePreferredPort(requestedExpoPort)
        : await allocatePreferredPort(DEFAULT_EXPO_PORT);

    const envDir = path.join(ENVIRONMENTS_DIR, name);
    fs.mkdirSync(path.join(envDir, "server", "pglite"), { recursive: true });
    fs.mkdirSync(path.join(envDir, "server", "logs"), { recursive: true });
    fs.mkdirSync(path.join(envDir, "cli", "home"), { recursive: true });
    const projectPath = copyLabRatProject(envDir);

    const config: EnvironmentConfig = {
        name,
        serverPort,
        expoPort,
        createdAt: new Date().toISOString(),
        template: "empty",
        projectTemplate: "lab-rat-todo-project",
        projectPath,
    };
    writeEnvironmentConfig(config);

    console.log(`Running database migration for ${name}...`);
    const migrationEnv = buildEnvVars(envDir, serverPort, expoPort);
    const standaloneTs = path.join(REPO_ROOT, "packages", "agenthub-server", "sources", "standalone.ts");
    const result = spawnSync(
        resolveRepositoryBinary("tsx"),
        [standaloneTs, "migrate"],
        {
            cwd: path.join(REPO_ROOT, "packages", "agenthub-server"),
            env: { ...process.env, ...migrationEnv },
            stdio: "inherit",
        }
    );
    if (result.status !== 0) {
        fs.rmSync(envDir, { recursive: true, force: true });
        throw new Error(`Migration failed with exit code ${result.status}`);
    }

    if (!opts?.noSwitch) {
        writeCurrentConfig(name);
    }

    console.log("");
    console.log(`Environment created: ${name}`);
    console.log(`  Server: http://localhost:${serverPort}`);
    console.log(`  Webapp: http://localhost:${expoPort}`);
    console.log(`  Project: ${projectPath}`);
    console.log("");
    const envShRelative = path.relative(process.cwd(), path.join(envDir, "env.sh"));
    console.log("Start in separate terminals:");
    console.log("");
    console.log(`  Server:  pnpm env:server`);
    console.log(`  Webapp:  pnpm env:web`);
    console.log("");
    console.log("CLI (from any terminal, anywhere):");
    console.log("");
    console.log(`  One-liner: ${buildCliCommand(envDir)}`);
    console.log("");
    console.log(`  source ${envShRelative}`);
    console.log(`  agenthub`);
    console.log("");
    console.log(`Full env.sh path: ${path.join(envDir, "env.sh")}`);

    return name;
}

export async function startEnvironmentServices(name: string, options: { web?: boolean } = {}): Promise<void> {
    const envDir = getEnvironmentDir(name);
    const config = readEnvironmentConfig(name);
    const envVars = buildEnvVars(envDir, config.serverPort, config.expoPort);
    const mergedEnv: Record<string, string | undefined> = { ...process.env, ...envVars };

    const serverLogFile = path.join(envDir, "server", "stdout.log");
    rotateEnvironmentLogs(path.join(envDir, "server"));
    console.log(`Starting server on port ${config.serverPort}...`);
    const packageManager = resolveRepositoryPackageManager();
    const serverPid = spawnManagedEnvironmentService(packageManager.command, [...packageManager.argsPrefix, "standalone", "serve"], {
        cwd: path.join(REPO_ROOT, "packages", "agenthub-server"),
        env: mergedEnv,
        logFile: serverLogFile,
    });
    writePidFile(envDir, "server", serverPid);

    const serverUrl = `http://localhost:${config.serverPort}`;
    try {
        await waitFor(async () => {
            const res = await fetch(`${serverUrl}/`);
            return res.ok;
        }, 30_000, "server");
    } catch {
        throw new Error(`Server failed to start. Check logs: ${serverLogFile}`);
    }
    console.log(`  Server is healthy.`);

    if (options.web === false) {
        console.log(`  Web startup skipped (server-only integration environment).`);
        return;
    }

    const webLogFile = path.join(envDir, "web", "stdout.log");
    fs.mkdirSync(path.join(envDir, "web"), { recursive: true });
    rotateEnvironmentLogs(path.join(envDir, "web"));
    console.log(`Starting web on port ${config.expoPort}...`);
    const webPid = spawnManagedEnvironmentService(packageManager.command, [...packageManager.argsPrefix, "web", "--port", String(config.expoPort)], {
        cwd: path.join(REPO_ROOT, "packages", "agenthub-app"),
        env: buildWebServiceEnv(mergedEnv),
        logFile: webLogFile,
    });
    writePidFile(envDir, "web", webPid);

    try {
        await waitFor(() => isPortInUse(config.expoPort), getWebStartupTimeoutMs(mergedEnv), "web");
    } catch {
        throw new Error(`Web failed to start. Check logs: ${webLogFile}`);
    }
    console.log(`  Web is listening.`);
}

const ED25519_PKCS8_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function createSeededAuthIdentity(
    secret: Uint8Array,
    challenge: Uint8Array,
): { publicKey: Buffer; signature: Buffer } {
    if (secret.byteLength !== 32) {
        throw new Error(`Authenticated environment secret must be a 32-byte Ed25519 seed; received ${secret.byteLength}`);
    }

    const privateKey = crypto.createPrivateKey({
        key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, Buffer.from(secret)]),
        format: 'der',
        type: 'pkcs8',
    });
    const publicKeyDer = crypto.createPublicKey(privateKey).export({
        format: 'der',
        type: 'spki',
    });

    return {
        publicKey: Buffer.from(publicKeyDer).subarray(-32),
        signature: crypto.sign(null, Buffer.from(challenge), privateKey),
    };
}

export async function seedEnvironment(name: string): Promise<void> {
    const envDir = getEnvironmentDir(name);
    const config = readEnvironmentConfig(name);
    const serverUrl = `http://localhost:${config.serverPort}`;

    try {
        const res = await fetch(`${serverUrl}/`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
    } catch {
        throw new Error(`Server not reachable at ${serverUrl}. Start it first: pnpm env:server`);
    }

    const secret = crypto.randomBytes(32);
    const challenge = crypto.randomBytes(32);
    const { publicKey: rawPublicKey, signature } = createSeededAuthIdentity(secret, challenge);

    const toBase64 = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64");
    const toBase64Url = (buf: Buffer | Uint8Array) =>
        Buffer.from(buf).toString("base64url");

    const authRes = await fetch(`${serverUrl}/v1/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: toBase64(rawPublicKey),
            challenge: toBase64(challenge),
            signature: toBase64(signature),
        }),
    });
    if (!authRes.ok) {
        throw new Error(`Auth failed: ${authRes.status} ${await authRes.text()}`);
    }
    const { token } = (await authRes.json()) as { token: string };

    const secretBase64 = toBase64(secret);

    const cliHome = path.join(envDir, "cli", "home");
    fs.mkdirSync(cliHome, { recursive: true });

    fs.writeFileSync(
        path.join(cliHome, "access.key"),
        JSON.stringify({ secret: secretBase64, token }, null, 2),
    );

    fs.writeFileSync(
        path.join(cliHome, "settings.json"),
        JSON.stringify(
            {
                schemaVersion: 2,
                onboardingCompleted: true,
                machineId: crypto.randomUUID(),
            },
            null,
            2,
        ),
    );

    const authenticatedWebUrl = buildAuthenticatedWebUrl(config.expoPort, token, secretBase64);
    writeEnvironmentConfig({ ...config, authenticatedWebUrl });

    const daemonStatePath = path.join(envDir, "cli", "home", "daemon.state.json");
    if (fs.existsSync(daemonStatePath)) {
        try {
            const daemonState = JSON.parse(fs.readFileSync(daemonStatePath, "utf-8"));
            if (daemonState.pid && isProcessAlive(daemonState.pid)) {
                console.log(`Stopping existing daemon (PID ${daemonState.pid})...`);
                killProcess(daemonState.pid);
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch {}
    }

    const envVars = buildEnvVars(envDir, config.serverPort, config.expoPort);
    const daemonEnv = { ...process.env, ...envVars };
    delete daemonEnv.CLAUDECODE;

    const agenthubBin = getEnvironmentCliLauncher(envDir);
    if (!fs.existsSync(agenthubBin)) {
        throw new Error(`Private CLI bundle is missing at ${agenthubBin}. Run authenticated env up first.`);
    }
    const daemon = spawn(process.execPath, [agenthubBin, "daemon", "start"], {
        env: daemonEnv,
        stdio: "ignore",
        detached: true,
    });
    daemon.unref();

    const machineRegistered = await waitFor(async () => {
        const res = await fetch(`${serverUrl}/v1/machines`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return false;
        const machines = (await res.json()) as unknown[];
        return machines.length > 0;
    }, 10_000, "machine registration").then(() => true, () => false);

    console.log(`  Seeded: credentials written, daemon ${machineRegistered ? "registered" : "starting"}`);
    console.log(`  Auth URL: ${formatEnvironmentAuthUrlForOutput(authenticatedWebUrl)}`);
}

export function stopEnvironment(name: string): void {
    const envDir = getEnvironmentDir(name);
    let killed = 0;

    const stoppedSessions = stopEnvironmentDaemonSessions(envDir);
    if (stoppedSessions > 0) {
        console.log(`Stopping ${stoppedSessions} isolated daemon session(s)...`);
    }

    for (const service of ["server", "web"] as const) {
        const pid = readPidFile(envDir, service);
        if (pid !== null) {
            if (isProcessAlive(pid)) {
                console.log(`Stopping ${service} (PID ${pid})...`);
                killProcess(pid);
                killed++;
            } else {
                console.log(`${service} PID ${pid} already dead.`);
            }
            removePidFile(envDir, service);
        }
    }

    const daemonStatePath = path.join(envDir, "cli", "home", "daemon.state.json");
    if (fs.existsSync(daemonStatePath)) {
        try {
            const daemonState = JSON.parse(fs.readFileSync(daemonStatePath, "utf-8"));
            if (daemonState.pid && isProcessAlive(daemonState.pid)) {
                console.log(`Stopping daemon (PID ${daemonState.pid})...`);
                killProcess(daemonState.pid);
                killed++;
            }
        } catch {}
    }

    if (killed === 0) {
        console.log(`No running services found for "${name}".`);
    } else {
        console.log("");
        console.log(`Environment "${name}" is down. Stopped ${killed} process(es).`);
    }
}

export function removeEnvironment(name: string): void {
    const envDir = getEnvironmentDir(name);
    const currentConfig = readCurrentConfig();
    if (currentConfig?.current === name && fs.existsSync(CURRENT_ENV_PATH)) {
        fs.unlinkSync(CURRENT_ENV_PATH);
    }
    fs.rmSync(envDir, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 250,
    });
    console.log(`Removed environment: ${name}`);
}

// ============================================================================
// Commands
// ============================================================================

async function commandNew(opts?: { noSwitch?: boolean }): Promise<string> {
    return createEnvironment(opts);
}

export function sanitizeEnvironmentListUrl(url: string): string {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
}

export function formatEnvironmentAuthUrlForOutput(
    url: string,
    environment: Record<string, string | undefined> = process.env,
): string {
    const ci = environment.CI?.trim().toLowerCase();
    const isCi = Boolean(ci && !["0", "false", "no", "off"].includes(ci));
    return isCi ? sanitizeEnvironmentListUrl(url) : url;
}

function commandList() {
    const envs = listEnvironments();
    if (envs.length === 0) {
        console.log("No environments. Run `pnpm env:new` to create one.");
        return;
    }

    const currentConfig = readCurrentConfig();
    const currentName = currentConfig?.current;

    console.log("Environments:");
    console.log("");
    for (const envName of envs) {
        const config = readEnvironmentConfig(envName);
        const isCurrent = envName === currentName;
        const marker = isCurrent ? " *" : "  ";

        const serverUp = isPortInUse(config.serverPort);
        const expoUp = isPortInUse(config.expoPort);

        const serverStatus = serverUp ? "running" : "stopped";
        const expoStatus = expoUp ? "running" : "stopped";

        const serverUrl = `http://localhost:${config.serverPort}`;
        const bundlerUrl = `http://localhost:${config.expoPort}`;
        const webAppUrl = sanitizeEnvironmentListUrl(config.authenticatedWebUrl ?? bundlerUrl);

        console.log(`${marker} ${envName}`);
        console.log(`     Server:  ${serverUrl} (${serverStatus})`);
        console.log(`     Bundler: ${bundlerUrl} (${expoStatus})`);
        console.log(`     Web app: ${webAppUrl}`);
        console.log(`     Created: ${config.createdAt}`);
        console.log("");
    }
}

function commandUse(name: string) {
    const envDir = path.join(ENVIRONMENTS_DIR, name);
    if (!fs.existsSync(path.join(envDir, "environment.json"))) {
        console.error(`Environment "${name}" not found.`);
        console.error(`Available: ${listEnvironments().join(", ") || "(none)"}`);
        process.exit(1);
    }
    writeCurrentConfig(name);
    console.log(`Switched to environment: ${name}`);
}

function commandRemove(name: string) {
    const envDir = path.join(ENVIRONMENTS_DIR, name);
    if (!fs.existsSync(path.join(envDir, "environment.json"))) {
        console.error(`Environment "${name}" not found.`);
        process.exit(1);
    }

    // Check if it's the current environment
    const currentConfig = readCurrentConfig();
    if (currentConfig?.current === name) {
        // Clear current
        fs.unlinkSync(CURRENT_ENV_PATH);
    }

    fs.rmSync(envDir, { recursive: true, force: true });
    console.log(`Removed environment: ${name}`);
}

function commandCurrent() {
    const currentConfig = readCurrentConfig();
    if (!currentConfig?.current) {
        console.error("No current environment. Run `pnpm env:new` or `pnpm env:use <name>`.");
        process.exit(1);
    }
    const envShPath = path.join(ENVIRONMENTS_DIR, currentConfig.current, "env.sh");
    if (!fs.existsSync(envShPath)) {
        console.error(`Current environment "${currentConfig.current}" is missing. Run \`pnpm env:new\`.`);
        process.exit(1);
    }
    console.log(envShPath);

    const config = readEnvironmentConfig(currentConfig.current);
    const webAppUrl = config.authenticatedWebUrl ?? `http://localhost:${config.expoPort}`;
    console.log(`\nServer:  http://localhost:${config.serverPort}`);
    console.log(`Bundler: http://localhost:${config.expoPort}`);
    console.log(`Web app: ${webAppUrl}`);
}

function commandDoctor(targetName?: string) {
    const names = targetName ? [targetName] : listEnvironments();
    if (names.length === 0) {
        console.log("No environments to inspect.");
        return;
    }
    let unhealthy = 0;
    for (const name of names) {
        const health = inspectEnvironmentHealth(getEnvironmentDir(name));
        if (health.issues.length > 0) unhealthy += 1;
        console.log(JSON.stringify({ name, ...health }, null, 2));
    }
    if (unhealthy > 0) process.exitCode = 1;
}

function commandPrune(args: string[]) {
    const currentName = readCurrentConfig()?.current;
    const environments = listEnvironments().map((name) => ({ name, health: inspectEnvironmentHealth(getEnvironmentDir(name)) }));
    const candidates = selectPrunableEnvironments(environments, currentName);
    if (candidates.length === 0) {
        console.log("No confirmed stale environments to prune.");
        return;
    }
    console.log(JSON.stringify({ dryRun: !args.includes("--apply"), current: currentName ?? null, candidates }, null, 2));
    if (!args.includes("--apply")) return;
    if (process.env.AGENTHUB_ENV_PRUNE_CONFIRM !== "DELETE") {
        console.error("Refusing to prune: set AGENTHUB_ENV_PRUNE_CONFIRM=DELETE together with --apply.");
        process.exitCode = 1;
        return;
    }
    for (const name of candidates) {
        try { stopEnvironment(name); } catch (error) { console.error(`Failed to stop ${name}:`, error); continue; }
        removeEnvironment(name);
    }
}

function commandRun(service: string, serviceArgs: string[] = []) {
    const currentConfig = readCurrentConfig();
    if (!currentConfig?.current) {
        console.error("No current environment. Run `pnpm env:new` first.");
        process.exit(1);
    }

    const envName = currentConfig.current;
    const envDir = path.join(ENVIRONMENTS_DIR, envName);
    const envJsonPath = path.join(envDir, "environment.json");

    if (!fs.existsSync(envJsonPath)) {
        console.error(`Environment "${envName}" not found. Run \`pnpm env:new\`.`);
        process.exit(1);
    }

    const config = readEnvironmentConfig(envName);
    const envVars = buildEnvVars(envDir, config.serverPort, config.expoPort);
    const mergedEnv = { ...process.env, ...envVars };
    const packageManager = resolveRepositoryPackageManager();

    switch (service) {
        case "server": {
            console.log(`Starting server for environment "${envName}" on port ${config.serverPort}...`);
            const result = spawnSync(
                packageManager.command,
                [...packageManager.argsPrefix, "standalone", "serve"],
                {
                    cwd: path.join(REPO_ROOT, "packages", "agenthub-server"),
                    env: mergedEnv,
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 1);
            break;
        }
        case "web": {
            console.log(`Starting web app for environment "${envName}" on port ${config.expoPort}...`);
            const result = spawnSync(
                packageManager.command,
                [...packageManager.argsPrefix, "web", "--port", String(config.expoPort)],
                {
                    cwd: path.join(REPO_ROOT, "packages", "agenthub-app"),
                    // Expo treats `--web` as "open in browser". Disable that for env-managed runs.
                    env: buildWebServiceEnv(mergedEnv),
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 1);
            break;
        }
        case "ios": {
            console.log(`Starting iOS app for environment "${envName}"...`);
            const result = spawnSync(
                packageManager.command,
                [...packageManager.argsPrefix, "ios"],
                {
                    cwd: path.join(REPO_ROOT, "packages", "agenthub-app"),
                    env: mergedEnv,
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 1);
            break;
        }
        case "android": {
            console.log(`Starting Android app for environment "${envName}"...`);
            const result = spawnSync(
                packageManager.command,
                [...packageManager.argsPrefix, "android"],
                {
                    cwd: path.join(REPO_ROOT, "packages", "agenthub-app"),
                    env: mergedEnv,
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 1);
            break;
        }
        case "cli": {
            console.log(`Starting CLI for environment "${envName}"...`);
            const cliBin = getEnvironmentCliLauncher(envDir);
            if (!fs.existsSync(cliBin)) {
                console.error(`Private CLI bundle is missing at ${cliBin}. Run \'pnpm env:up:authenticated\' first.`);
                process.exit(1);
            }
            const result = spawnSync(
                "node",
                [cliBin, ...serviceArgs],
                {
                    env: mergedEnv,
                    stdio: "inherit",
                }
            );
            process.exit(result.status ?? 1);
            break;
        }
        default:
            console.error(`Unknown service: "${service}". Use: server, web, ios, android, cli`);
            process.exit(1);
    }
}

// ============================================================================
// env.sh builder
// ============================================================================

function buildEnvVars(envDir: string, serverPort: number, expoPort: number): Record<string, string> {
    const devAuth = readDevAuth(envDir);
    const projectDir = path.join(envDir, "project");

    return {
        // Server
        AGENTHUB_MASTER_SECRET: "agenthub-dev-secret",
        PORT: String(serverPort),
        NODE_ENV: "development",
        DATA_DIR: path.join(envDir, "server"),
        PGLITE_DIR: path.join(envDir, "server", "pglite"),
        DATABASE_URL: "",
        METRICS_ENABLED: "false",

        // App (Expo)
        EXPO_PUBLIC_SERVER_URL: `http://localhost:${serverPort}`,
        EXPO_PUBLIC_AGENTHUB_SERVER_URL: `http://localhost:${serverPort}`,
        EXPO_PUBLIC_LOG_SERVER_URL: "http://localhost:8787",
        EXPO_PORT: String(expoPort),

        // CLI
        AGENTHUB_SERVER_URL: `http://localhost:${serverPort}`,
        AGENTHUB_WEBAPP_URL: `http://localhost:${expoPort}`,
        AGENTHUB_HOME_DIR: path.join(envDir, "cli", "home"),
        AGENTHUB_CLI_ROOT: getEnvironmentCliBundleRoot(envDir),
        AGENTHUB_PROJECT_DIR: projectDir,
        AGENTHUB_VARIANT: "dev",
        DEBUG: "1",
        ...(devAuth ? {
            EXPO_PUBLIC_DEV_TOKEN: devAuth.token,
            EXPO_PUBLIC_DEV_SECRET: devAuth.secret,
        } : {}),
    };
}

function buildEnvSh(name: string, envDir: string, serverPort: number, expoPort: number): string {
    const vars = buildEnvVars(envDir, serverPort, expoPort);
    const lines: string[] = [
        `# AgentHub Dev Environment: ${name}`,
        `# Generated by environments/environments.ts`,
        `# Source this file in your terminal: source ${path.join(envDir, "env.sh")}`,
        "",
    ];

    // Group exports by section
    lines.push("# Server");
    lines.push(`export AGENTHUB_MASTER_SECRET="${vars.AGENTHUB_MASTER_SECRET}"`);
    lines.push(`export PORT=${vars.PORT}`);
    lines.push(`export NODE_ENV="${vars.NODE_ENV}"`);
    lines.push(`export DATA_DIR="${vars.DATA_DIR}"`);
    lines.push(`export PGLITE_DIR="${vars.PGLITE_DIR}"`);
    lines.push(`export DATABASE_URL=""`);
    lines.push(`export METRICS_ENABLED=false`);
    lines.push("");

    lines.push("# App (Expo)");
    lines.push(`export EXPO_PUBLIC_SERVER_URL="${vars.EXPO_PUBLIC_SERVER_URL}"`);
    lines.push(`export EXPO_PUBLIC_AGENTHUB_SERVER_URL="${vars.EXPO_PUBLIC_AGENTHUB_SERVER_URL}"`);
    lines.push(`export EXPO_PUBLIC_LOG_SERVER_URL="${vars.EXPO_PUBLIC_LOG_SERVER_URL}"`);
    if (vars.EXPO_PUBLIC_DEV_TOKEN && vars.EXPO_PUBLIC_DEV_SECRET) {
        lines.push(`export EXPO_PUBLIC_DEV_TOKEN="${vars.EXPO_PUBLIC_DEV_TOKEN}"`);
        lines.push(`export EXPO_PUBLIC_DEV_SECRET="${vars.EXPO_PUBLIC_DEV_SECRET}"`);
    }
    lines.push(`export EXPO_PORT=${vars.EXPO_PORT}`);
    lines.push("");

    lines.push("# CLI");
    lines.push(`export AGENTHUB_SERVER_URL="${vars.AGENTHUB_SERVER_URL}"`);
    lines.push(`export AGENTHUB_WEBAPP_URL="${vars.AGENTHUB_WEBAPP_URL}"`);
    lines.push(`export AGENTHUB_HOME_DIR="${vars.AGENTHUB_HOME_DIR}"`);
    lines.push(`export AGENTHUB_CLI_ROOT="${vars.AGENTHUB_CLI_ROOT}"`);
    lines.push(`export AGENTHUB_PROJECT_DIR="${vars.AGENTHUB_PROJECT_DIR}"`);
    lines.push(`export AGENTHUB_VARIANT=dev`);
    lines.push(`export DEBUG=1`);
    lines.push(`export PATH="${path.join(envDir, "bin")}:$PATH"`);
    lines.push("");
    lines.push("# Commands exposed by this env");
    lines.push("# - agenthub");
    lines.push("# - agenthub-agent");
    lines.push("");

    return lines.join("\n");
}

function writeEnvCommands(envDir: string): void {
    const binDir = path.join(envDir, "bin");
    fs.mkdirSync(binDir, { recursive: true });

    const commands = [
        {
            name: "agenthub",
            entrypoint: path.join(REPO_ROOT, "packages", "agenthub-cli", "bin", "agenthub.mjs"),
        },
        {
            name: "agenthub-agent",
            entrypoint: path.join(REPO_ROOT, "packages", "agenthub-agent", "bin", "agenthub-agent.mjs"),
        },
    ];

    for (const command of commands) {
        const wrapperPath = path.join(binDir, command.name);
        const wrapper = [
            "#!/usr/bin/env bash",
            `exec node ${JSON.stringify(command.entrypoint)} "$@"`,
            "",
        ].join("\n");
        fs.writeFileSync(wrapperPath, wrapper);
        fs.chmodSync(wrapperPath, 0o755);
    }
}

function buildAuthenticatedWebUrl(expoPort: number, token: string, secret: string): string {
    const webParams = new URLSearchParams({
        dev_token: token,
        dev_secret: Buffer.from(secret, "base64").toString("base64url"),
    });
    return `http://localhost:${expoPort}/?${webParams}`;
}

function buildCliCommand(envDir: string): string {
    return `source "${path.join(envDir, "env.sh")}" && agenthub`;
}

// ============================================================================
// Seed auth
// ============================================================================

async function commandSeed(targetName?: string) {
    const envName = targetName ?? readCurrentConfig()?.current;
    if (!envName) {
        console.error("No current environment. Run `pnpm env:new` first.");
        process.exit(1);
    }
    await seedEnvironment(envName);
}

// ============================================================================
// Up / Down
// ============================================================================

export interface EnvironmentUpTransactionDeps {
    create: typeof createEnvironment;
    setTemplate: (envName: string, template: Template) => void;
    start: typeof startEnvironmentServices;
    build: (envName: string) => void;
    seed: typeof seedEnvironment;
    stop: (envName: string) => void;
    remove: (envName: string) => void;
}

/**
 * Runs `env up` as one transaction.  The dependency seam is intentionally
 * narrow so each startup stage can be failure-injected without launching real
 * services; production uses the concrete defaults below.
 */
export async function runEnvironmentUpTransaction(
    template: Template,
    opts?: { noSwitch?: boolean },
    overrides?: Partial<EnvironmentUpTransactionDeps>,
): Promise<string> {
    const deps: EnvironmentUpTransactionDeps = {
        create: createEnvironment,
        setTemplate: setEnvironmentTemplate,
        start: startEnvironmentServices,
        build: (envName) => buildPrivateCliBundle(getEnvironmentDir(envName)),
        seed: seedEnvironment,
        stop: stopEnvironment,
        remove: removeEnvironment,
        ...overrides,
    };

    const envName = await deps.create(opts);
    try {
        deps.setTemplate(envName, template);
        await deps.start(envName);
        if (template === "authenticated-empty") {
            deps.build(envName);
            await deps.seed(envName);
        }
        return envName;
    } catch (error) {
        // env up is a transaction from the caller's perspective: do not leave
        // server/web/daemon processes or credentials behind after any stage
        // fails. Cleanup errors must not hide the original failure.
        try { deps.stop(envName); } catch {}
        try { deps.remove(envName); } catch {}
        throw error;
    }
}

async function commandUp(template: Template, opts?: { noSwitch?: boolean }) {
    const envName = await runEnvironmentUpTransaction(template, opts);
    const envDir = getEnvironmentDir(envName);
    const config = readEnvironmentConfig(envName);

    // Seed if template requires it.  The authenticated daemon always uses
    // an environment-private bundle; it must never rebuild shared dist.
    if (template === "authenticated-empty") {
        console.log("Building private CLI bundle (shared production bundle is untouched)...");
        console.log("Seeding auth + starting daemon...");
    }

    // Print summary
    const finalConfig = readEnvironmentConfig(envName);
    console.log("");
    console.log(`Environment "${envName}" is up!`);
    console.log(`  Server: http://localhost:${config.serverPort}`);
    console.log(`  Web:    http://localhost:${config.expoPort}`);
    console.log(`  Project: ${finalConfig.projectPath}`);

    if (finalConfig.authenticatedWebUrl) {
        console.log(`  Open:   ${formatEnvironmentAuthUrlForOutput(finalConfig.authenticatedWebUrl)}`);
    }
    if (finalConfig.cliCommand) {
        console.log(`  CLI:    ${finalConfig.cliCommand}`);
    }

    console.log(`  Logs:   ${path.relative(process.cwd(), path.join(envDir, "server", "stdout.log"))}`);
    console.log(`          ${path.relative(process.cwd(), path.join(envDir, "web", "stdout.log"))}`);
    console.log(`  Stop:   pnpm env:down`);
    console.log("");
}

function commandDown(targetName?: string) {
    const envName = targetName ?? readCurrentConfig()?.current;
    if (!envName) {
        console.error("No current environment. Nothing to stop.");
        process.exit(1);
    }
    stopEnvironment(envName);
}

// ============================================================================
// Tailscale
// ============================================================================

function commandTailscale() {
    const currentConfig = readCurrentConfig();
    if (!currentConfig?.current) {
        console.error("No current environment. Run `pnpm env:new` first.");
        process.exit(1);
    }

    const config = readEnvironmentConfig(currentConfig.current);

    // Get tailscale hostname
    let hostname: string;
    try {
        const statusJson = execSync("tailscale status --self --json", { encoding: "utf-8" });
        const status = JSON.parse(statusJson);
        hostname = status.Self.DNSName.replace(/\.$/, "");
    } catch {
        console.error("Failed to get Tailscale hostname. Is Tailscale running?");
        process.exit(1);
    }

    // Reset existing funnels
    try { execSync("tailscale funnel reset", { stdio: "ignore" }); } catch {}

    // Expose web app on 443 and server on 8443
    try {
        execSync(`tailscale funnel --bg ${config.expoPort}`, { stdio: "inherit" });
        execSync(`tailscale funnel --bg --https=8443 ${config.serverPort}`, { stdio: "inherit" });
    } catch (e: any) {
        console.error("Failed to set up Tailscale funnel:", e.message);
        process.exit(1);
    }

    console.log("");
    console.log(`Tailscale funnel active for "${currentConfig.current}":`);
    console.log("");
    console.log(`  Web:    https://${hostname}`);
    console.log(`  Server: https://${hostname}:8443`);
    console.log("");
}

// ============================================================================
// CLI entry point
// ============================================================================

async function main(): Promise<void> {
    const [subcommand, ...args] = process.argv.slice(2);

    switch (subcommand) {
        case "new": {
            const noSwitch = args.includes("--no-switch");
            await commandNew({ noSwitch });
            break;
        }
        case "list":
            commandList();
            break;
        case "use":
            if (!args[0]) {
                console.error("Usage: pnpm env:use <name>");
                process.exit(1);
            }
            commandUse(args[0]);
            break;
        case "remove":
            if (!args[0]) {
                console.error("Usage: pnpm env:remove <name>");
                process.exit(1);
            }
            commandRemove(args[0]);
            break;
        case "current":
            commandCurrent();
            break;
        case "doctor":
            commandDoctor(args[0]);
            break;
        case "prune":
            commandPrune(args);
            break;
        case "run":
            if (!args[0]) {
                console.error("Usage: pnpm env:server | pnpm env:web | pnpm env:cli");
                process.exit(1);
            }
            commandRun(args[0], args.slice(1));
            break;
        case "seed":
            await commandSeed();
            break;
        case "up": {
            const templateIdx = args.indexOf("--template");
            const template = templateIdx !== -1 ? args[templateIdx + 1] : undefined;
            if (!template || !VALID_TEMPLATES.includes(template as Template)) {
                console.error(`Usage: pnpm env:up --template <${VALID_TEMPLATES.join("|")}>`);
                process.exit(1);
            }
            const noSwitch = args.includes("--no-switch");
            await commandUp(template as Template, { noSwitch });
            break;
        }
        case "down":
            commandDown(args[0]);
            break;
        case "tailscale":
            commandTailscale();
            break;
        default:
            console.log(`AgentHub Environment Manager

Usage:
  pnpm env:up --template <t>  Create + start everything (templates: ${VALID_TEMPLATES.join(", ")})
  pnpm env:up:authenticated   Create + start everything with the authenticated template
  pnpm env:down               Stop all services for current environment

  pnpm env:new              Create a new isolated dev environment
  pnpm env:list             List all environments with status
  pnpm env:use <name>       Switch to a different environment
  pnpm env:remove <name>    Delete an environment
  pnpm env:current          Print current environment's env.sh path
  pnpm env:doctor [name]     Read-only environment/config/PID diagnostics
  pnpm env:prune [--apply]   Dry-run stale environment cleanup; --apply is required to delete
  pnpm env:seed             Seed auth for CLI + web (requires server running)

  pnpm env:server           Start the server (current environment)
  pnpm env:web              Start the web app (current environment)
  pnpm env:ios              Start the iOS app (current environment)
  pnpm env:android          Start the Android app (current environment)
  pnpm env:cli              Start the CLI (current environment)

  pnpm env:tailscale        Expose server + web via Tailscale funnel
`);
            if (subcommand && subcommand !== "--help" && subcommand !== "-h") {
                process.exit(1);
            }
    }
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
