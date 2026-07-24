import { describe, expect, it } from 'vitest';
import {
    buildOfficialDiscoveryScopes,
    filterOfficialCandidatesForProject,
    getOfficialCandidateKey,
    isPathInProjectScope,
} from './sessionWorkbench';

type Thread = {
    id: string;
    provider: 'codex' | 'claude';
    machineId: string;
    cwd?: string;
    updatedAt?: number;
};

describe('sessionWorkbench', () => {
    it('creates provider-aware official candidate keys', () => {
        expect(getOfficialCandidateKey('codex', 'abc')).toBe('codex:abc');
        expect(getOfficialCandidateKey('claude', 'abc')).toBe('claude:abc');
    });

    it('matches exact project root paths only', () => {
        expect(isPathInProjectScope('/repo/app', '/repo/app')).toBe(true);
        expect(isPathInProjectScope('/repo/app/packages/foo', '/repo/app')).toBe(false);
        expect(isPathInProjectScope('/repo/application', '/repo/app')).toBe(false);
        expect(isPathInProjectScope('/other/app', '/repo/app')).toBe(false);
        expect(isPathInProjectScope(undefined, '/repo/app')).toBe(false);
    });

    it('filters official candidates by machine, project path, hidden keys, and connected keys', () => {
        const threads: Thread[] = [
            { id: 'current-codex', provider: 'codex', machineId: 'm1', cwd: '/repo/app' },
            { id: 'child-claude', provider: 'claude', machineId: 'm1', cwd: '/repo/app/packages/a' },
            { id: 'hidden-codex', provider: 'codex', machineId: 'm1', cwd: '/repo/app' },
            { id: 'connected-claude', provider: 'claude', machineId: 'm1', cwd: '/repo/app' },
            { id: 'wrong-machine', provider: 'codex', machineId: 'm2', cwd: '/repo/app' },
            { id: 'wrong-path', provider: 'codex', machineId: 'm1', cwd: '/tmp/test' },
        ];

        const visible = filterOfficialCandidatesForProject(
            threads,
            { machineId: 'm1', path: '/repo/app' },
            new Set(['codex:hidden-codex']),
            new Set(['claude:connected-claude']),
        );

        expect(visible.map((thread) => thread.id)).toEqual(['current-codex']);
    });

    it('builds one discovery scope per active machine and project path', () => {
        const scopes = buildOfficialDiscoveryScopes(
            [
                { machineId: 'm1', path: '/repo/app' },
                { machineId: 'm1', path: '/repo/app' },
                { machineId: 'm1', path: '/repo/other' },
                { machineId: 'm2', path: '/repo/app' },
            ],
            new Set(['m1']),
        );

        expect(scopes).toEqual([
            { machineId: 'm1', paths: ['/repo/app', '/repo/other'] },
        ]);
    });
});
