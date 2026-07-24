import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

describe('configuration', () => {
    const originalEnv = { ...process.env };
    let tempRoot: string;

    beforeEach(() => {
        vi.resetModules();
        tempRoot = mkdtempSync(join(tmpdir(), 'agenthub-config-'));
        process.env = { ...originalEnv };
        delete process.env.AGENTHUB_SERVER_URL;
        delete process.env.AGENTHUB_HOME_DIR;
        delete process.env.AGENTHUB_EXPERIMENTAL;
        delete process.env.AGENTHUB_DISABLE_CAFFEINATE;
        delete process.env.AGENTHUB_VARIANT;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        rmSync(tempRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('uses AgentHub defaults for server URL and home directory', async () => {
        const { configuration } = await import('./configuration');

        expect(configuration.serverUrl).toBe('https://agenthub.yzsd.asia:8443');
        expect(configuration.agentHubHomeDir).toBe(join(homedir(), '.agenthub'));
        expect(configuration.logsDir).toBe(join(homedir(), '.agenthub', 'logs'));
    });

    it('uses AgentHub environment variable overrides', async () => {
        process.env.AGENTHUB_SERVER_URL = 'https://agenthub.example.com';
        process.env.AGENTHUB_HOME_DIR = '~/agenthub-home';
        process.env.AGENTHUB_EXPERIMENTAL = 'yes';
        process.env.AGENTHUB_DISABLE_CAFFEINATE = '1';

        const { configuration } = await import('./configuration');

        expect(configuration.serverUrl).toBe('https://agenthub.example.com');
        expect(configuration.agentHubHomeDir).toBe(join(homedir(), 'agenthub-home'));
        expect(configuration.isExperimentalEnabled).toBe(true);
        expect(configuration.disableCaffeinate).toBe(true);
    });

    it('creates and repairs private runtime directories to mode 0700', async () => {
        const home = join(tempRoot, 'runtime-home');
        mkdirSync(join(home, 'logs'), { recursive: true, mode: 0o777 });
        chmodSync(home, 0o755);
        chmodSync(join(home, 'logs'), 0o755);
        writeFileSync(join(home, 'logs', 'legacy.log'), 'possibly sensitive', { mode: 0o644 });
        process.env.AGENTHUB_HOME_DIR = home;

        await import('./configuration');

        expect(statSync(home).mode & 0o777).toBe(0o700);
        expect(statSync(join(home, 'logs')).mode & 0o777).toBe(0o700);
        expect(statSync(join(home, 'logs', 'legacy.log')).mode & 0o777).toBe(0o600);
    });

    it('keeps only the trusted cached tool binaries executable while hardening the private tree', async () => {
        const home = join(tempRoot, 'runtime-tools-home');
        const unpacked = join(home, 'tools', '1.2.3', 'x64-linux', 'unpacked');
        mkdirSync(unpacked, { recursive: true, mode: 0o755 });
        writeFileSync(join(unpacked, 'difft'), 'fixture', { mode: 0o755 });
        writeFileSync(join(unpacked, 'rg'), 'fixture', { mode: 0o755 });
        writeFileSync(join(unpacked, 'ripgrep.node'), 'fixture', { mode: 0o755 });
        writeFileSync(join(unpacked, '.platform'), 'x64-linux\n', { mode: 0o644 });
        process.env.AGENTHUB_HOME_DIR = home;

        await import('./configuration');

        expect(statSync(unpacked).mode & 0o777).toBe(0o700);
        expect(statSync(join(unpacked, 'difft')).mode & 0o777).toBe(0o700);
        expect(statSync(join(unpacked, 'rg')).mode & 0o777).toBe(0o700);
        expect(statSync(join(unpacked, 'ripgrep.node')).mode & 0o777).toBe(0o600);
        expect(statSync(join(unpacked, '.platform')).mode & 0o777).toBe(0o600);
    });

});
