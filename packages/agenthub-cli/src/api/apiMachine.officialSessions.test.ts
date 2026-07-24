import { describe, expect, it } from 'vitest';
import { filterOfficialAgentSessionsForRequest } from './apiMachine';

describe('filterOfficialAgentSessionsForRequest', () => {
    it('filters by exact project paths, providers, and limit', () => {
        const sessions = [
            { id: 'codex-current', provider: 'codex', cwd: '/repo/app', updatedAt: 30 },
            { id: 'claude-child', provider: 'claude', cwd: '/repo/app/pkg', updatedAt: 20 },
            { id: 'codex-test', provider: 'codex', cwd: '/tmp/test', updatedAt: 10 },
        ] as const;

        const filtered = filterOfficialAgentSessionsForRequest(sessions, {
            paths: ['/repo/app'],
            providers: ['codex', 'claude'],
            limit: 2,
        });

        expect(filtered.map((session) => session.id)).toEqual(['codex-current']);
    });

    it('keeps old behavior when no request filters are provided', () => {
        const sessions = [
            { id: 'a', provider: 'codex', cwd: '/a', updatedAt: 1 },
            { id: 'b', provider: 'claude', cwd: '/b', updatedAt: 2 },
        ] as const;

        expect(filterOfficialAgentSessionsForRequest(sessions, {}).map((session) => session.id)).toEqual(['b', 'a']);
    });
});
