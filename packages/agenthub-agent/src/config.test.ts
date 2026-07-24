import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

describe('config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.AGENTHUB_SERVER_URL;
        delete process.env.AGENTHUB_HOME_DIR;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('defaults', () => {
        it('uses default server URL', () => {
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://agenthub.yzsd.asia:8443');
        });

        it('uses default home directory', () => {
            const config = loadConfig();
            expect(config.homeDir).toBe(join(homedir(), '.agenthub'));
        });

        it('derives credential path from home directory', () => {
            const config = loadConfig();
            expect(config.credentialPath).toBe(join(homedir(), '.agenthub', 'agent.key'));
        });
    });

    describe('env var overrides', () => {
        it('overrides server URL with AGENTHUB_SERVER_URL', () => {
            process.env.AGENTHUB_SERVER_URL = 'https://custom-server.example.com';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://custom-server.example.com');
        });

        it('overrides home directory with AGENTHUB_HOME_DIR', () => {
            process.env.AGENTHUB_HOME_DIR = '/tmp/custom-agenthub';
            const config = loadConfig();
            expect(config.homeDir).toBe('/tmp/custom-agenthub');
        });

        it('derives credential path from overridden home directory', () => {
            process.env.AGENTHUB_HOME_DIR = '/tmp/custom-agenthub';
            const config = loadConfig();
            expect(config.credentialPath).toBe('/tmp/custom-agenthub/agent.key');
        });

        it('allows both overrides simultaneously', () => {
            process.env.AGENTHUB_SERVER_URL = 'https://other.example.com';
            process.env.AGENTHUB_HOME_DIR = '/opt/agenthub';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://other.example.com');
            expect(config.homeDir).toBe('/opt/agenthub');
            expect(config.credentialPath).toBe('/opt/agenthub/agent.key');
        });

    });
});
