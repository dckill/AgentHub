import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const newSessionSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(app)/new/index.tsx'),
    'utf8',
);

describe('new session credentials lifecycle boundary', () => {
    it('binds credential discovery to the current account and aborts on cleanup', () => {
        expect(newSessionSource).toContain("import { sync } from '@/sync/sync';");
        expect(newSessionSource).toContain("import { runCredentialsLoad } from '../settings/credentialsLifecycle';");
        expect(newSessionSource).toContain('runCredentialsLoad({');
        expect(newSessionSource).toContain('sync.getAccountGeneration()');
        expect(newSessionSource).toContain('const controller = new AbortController()');
        expect(newSessionSource).toContain('controller.abort()');
        expect(newSessionSource).toContain('listCredentials(credentials, signal)');
    });

    it('does not resolve Codex runtime models with stale account credentials', () => {
        expect(newSessionSource).toContain('const generation = sync.getAccountGeneration()');
        expect(newSessionSource).toContain('getCredentialEnvVars(credentials, selectedCredentialId, {');
        expect(newSessionSource).toContain('}, controller.signal)');
        expect(newSessionSource).toContain('if (!isCurrent()) return;');
    });
});
