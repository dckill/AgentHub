import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxConfig } from '@/persistence';
import { createSessionMetadata, findLocalSkillNames } from './createSessionMetadata';

function createSandboxConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
    return {
        enabled: true,
        workspaceRoot: '~/Developer',
        sessionIsolation: 'workspace',
        customWritePaths: [],
        denyReadPaths: ['~/.ssh', '~/.aws', '~/.gnupg'],
        extraWritePaths: ['/tmp'],
        denyWritePaths: ['.env'],
        networkMode: 'allowed',
        allowedDomains: [],
        deniedDomains: [],
        allowLocalBinding: true,
        ...overrides,
    };
}

describe('createSessionMetadata', () => {
    it('publishes the prepared private runtime tools directory to supported providers', () => {
        const previous = process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
        process.env.AGENTHUB_INTERNAL_TOOLS_DIR = '/private/agenthub/tools/1.2.3/x64-linux/unpacked';
        try {
            const { metadata } = createSessionMetadata({ flavor: 'codex', machineId: 'machine-tools' });
            expect(metadata.agentHubToolsDir).toBe(process.env.AGENTHUB_INTERNAL_TOOLS_DIR);
        } finally {
            if (previous === undefined) delete process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
            else process.env.AGENTHUB_INTERNAL_TOOLS_DIR = previous;
        }
    });

    it('sets metadata.sandbox to the config when enabled', () => {
        const sandbox = createSandboxConfig();
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-1',
            startedBy: 'terminal',
            sandbox,
        });

        expect(metadata.sandbox).toEqual(sandbox);
    });

    it('sets metadata.sandbox to null when sandbox is disabled', () => {
        const sandbox = createSandboxConfig({ enabled: false });
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-2',
            startedBy: 'daemon',
            sandbox,
        });

        expect(metadata.sandbox).toBeNull();
    });

    it('sets metadata.sandbox to null when sandbox is not provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-3',
        });

        expect(metadata.sandbox).toBeNull();
    });

    it('sets metadata.dangerouslySkipPermissions to null when not provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-4',
        });

        expect(metadata.dangerouslySkipPermissions).toBeNull();
    });

    it('sets metadata.dangerouslySkipPermissions when provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-5',
            dangerouslySkipPermissions: true,
        });

        expect(metadata.dangerouslySkipPermissions).toBe(true);
    });

    it('preserves fork lineage metadata when provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-6',
            parentSessionId: 'agenthub-parent',
            forkedFromMessageId: 'message-42',
        });

        expect(metadata.parentSessionId).toBe('agenthub-parent');
        expect(metadata.forkedFromMessageId).toBe('message-42');
    });

    it('marks side chats without changing ordinary fork metadata', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-side-chat',
            parentSessionId: 'parent-session',
            isSideChat: true,
        });
        expect(metadata.parentSessionId).toBe('parent-session');
        expect(metadata.isSideChat).toBe(true);
    });

    it('finds local skill names from skill roots', () => {
        const root = mkdtempSync(join(tmpdir(), 'agenthub-skills-'));
        try {
            mkdirSync(join(root, 'debug'), { recursive: true });
            writeFileSync(join(root, 'debug', 'SKILL.md'), '# Debug');

            mkdirSync(join(root, '.system', 'frontend-design'), { recursive: true });
            writeFileSync(join(root, '.system', 'frontend-design', 'SKILL.md'), '# Frontend');

            mkdirSync(join(root, 'not-a-skill'), { recursive: true });

            expect(findLocalSkillNames([root])).toEqual(['debug', 'frontend-design']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
