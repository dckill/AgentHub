/**
 * Session Metadata Factory
 *
 * Creates session state and metadata objects for supported backends.
 * This follows DRY principles by providing a single implementation for all backends.
 *
 * @module createSessionMetadata
 */

import os from 'node:os';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { AgentState, Metadata } from '@/api/types';
import { configuration } from '@/configuration';
import { projectPath } from '@/projectPath';
import { resolveBundledToolsDir } from '@/tools/toolsPath';
import type { SandboxConfig } from '@/persistence';
import packageJson from '../../package.json';

/**
 * Backend flavor identifier for session metadata.
 */
export type BackendFlavor = 'claude' | 'codex';

/**
 * Options for creating session metadata.
 */
export interface CreateSessionMetadataOptions {
    /** Backend flavor (claude or codex) */
    flavor: BackendFlavor;
    /** Machine ID for server identification */
    machineId: string;
    /** How the session was started */
    startedBy?: 'daemon' | 'terminal';
    /** Active sandbox config for the session, or undefined when not used */
    sandbox?: SandboxConfig;
    /** Whether the backend runs with "dangerously skip permissions" behavior */
    dangerouslySkipPermissions?: boolean;
    /** AgentHub session id this session was forked from. */
    parentSessionId?: string;
    /** AgentHub message id used as the fork rewind point. */
    forkedFromMessageId?: string;
    isSideChat?: boolean;
}

/**
 * Result containing both state and metadata for session creation.
 */
export interface SessionMetadataResult {
    /** Agent state for session */
    state: AgentState;
    /** Session metadata */
    metadata: Metadata;
}

function collectSkillNamesFromRoot(root: string, names: Set<string>, depth: number = 0) {
    if (!existsSync(root)) {
        return;
    }

    let entries: string[];
    try {
        entries = readdirSync(root);
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = join(root, entry);
        let isDirectory = false;
        try {
            isDirectory = statSync(fullPath).isDirectory();
        } catch {
            continue;
        }
        if (!isDirectory) {
            continue;
        }

        if (existsSync(join(fullPath, 'SKILL.md'))) {
            names.add(entry);
            continue;
        }

        if (depth < 1) {
            collectSkillNamesFromRoot(fullPath, names, depth + 1);
        }
    }
}

export function findLocalSkillNames(roots: string[] = [
    resolve(process.cwd(), '.agents', 'skills'),
    resolve(os.homedir(), '.agents', 'skills'),
    resolve(os.homedir(), '.codex', 'skills'),
    resolve(configuration.agentHubHomeDir, 'skills'),
]): string[] {
    const names = new Set<string>();
    for (const root of roots) {
        collectSkillNamesFromRoot(root, names);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Creates session state and metadata for backend agents.
 *
 * This utility consolidates the common session metadata creation logic used by
 * Claude Code and Codex backends, ensuring consistency across implementations.
 *
 * @param opts - Options specifying flavor, machineId, and startedBy
 * @returns Object containing state and metadata for session creation
 *
 * @example
 * ```typescript
 * const { state, metadata } = createSessionMetadata({
 *     flavor: 'codex',
 *     machineId: settings.machineId,
 *     startedBy: opts.startedBy
 * });
 *
 * const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
 * ```
 */
export function createSessionMetadata(opts: CreateSessionMetadataOptions): SessionMetadataResult {
    const state: AgentState = {
        controlledByUser: false,
    };

    const metadata: Metadata = {
        path: process.cwd(),
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: opts.machineId,
        homeDir: os.homedir(),
        agentHubHomeDir: configuration.agentHubHomeDir,
        agentHubLibDir: projectPath(),
        agentHubToolsDir: resolveBundledToolsDir(),
        startedFromDaemon: opts.startedBy === 'daemon',
        hostPid: process.pid,
        startedBy: opts.startedBy || 'terminal',
        lifecycleState: 'running',
        lifecycleStateSince: Date.now(),
        flavor: opts.flavor,
        sandbox: opts.sandbox?.enabled ? opts.sandbox : null,
        dangerouslySkipPermissions: opts.dangerouslySkipPermissions ?? null,
        skills: findLocalSkillNames(),
        ...(opts.parentSessionId ? { parentSessionId: opts.parentSessionId } : {}),
        ...(opts.forkedFromMessageId ? { forkedFromMessageId: opts.forkedFromMessageId } : {}),
        ...(opts.isSideChat ? { isSideChat: true } : {}),
    };

    return { state, metadata };
}
