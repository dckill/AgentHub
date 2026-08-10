import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('new session recovery boundary', () => {
    it('invalidates session sync when loading a realtime new-session update fails', () => {
        const source = readFileSync(resolve(__dirname, 'sessionRealtimeDispatch.ts'), 'utf8');
        const branchStart = source.indexOf("if (body.t === 'new-session')");
        const branchEnd = source.indexOf("if (body.t === 'delete-session')", branchStart);
        expect(branchStart).toBeGreaterThanOrEqual(0);
        expect(branchEnd).toBeGreaterThan(branchStart);
        const branch = source.slice(branchStart, branchEnd);
        expect(branch).toContain('const handler = params.handleNewSession ?? handleNewSessionRealtimeUpdate;');
        expect(branch).toContain('await handler({');
        expect(branch).toContain('ensureSessionLoaded: () => params.ensureSessionLoaded(update.id)');
        expect(branch).toContain('assertCurrent: params.assertCurrent');
        expect(branch).toContain('params.invalidateSessions();');
    });
});
