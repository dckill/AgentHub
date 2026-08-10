import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const newSessionSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(app)/new/index.tsx'),
    'utf8',
);

const handleSendSource = newSessionSource.slice(
    newSessionSource.indexOf('const handleSend ='),
    newSessionSource.indexOf('const canSend ='),
);

describe('new session launch account boundary', () => {
    it('binds worktree, credential env, spawn, refresh and navigation to one account generation', () => {
        expect(newSessionSource).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(handleSendSource).toContain('const generation = sync.getAccountGeneration();');
        expect(handleSendSource).toContain('const isCurrent = () => generation !== null');
        expect(handleSendSource).toContain('runSessionActionRequest({');
        expect(handleSendSource).toContain('request: () => getCredentialEnvVars');
        expect(handleSendSource).toContain('request: () => machineSpawnNewSession');
        expect(handleSendSource).toContain('if (!isCurrent()) return;');
    });

    it('keeps the launch progress copy transparent instead of rendering a patched card', () => {
        const statusMarkup = newSessionSource.slice(
            newSessionSource.indexOf('styles.creationStatus,'),
            newSessionSource.indexOf('<ActivityIndicator size="small" color={theme.colors.accent} />'),
        );
        const statusStyle = newSessionSource.slice(
            newSessionSource.indexOf('creationStatus: {'),
            newSessionSource.indexOf('creationStatusText: {'),
        );

        expect(statusMarkup).not.toContain('backgroundColor');
        expect(statusMarkup).not.toContain('borderColor');
        expect(statusStyle).not.toContain('borderWidth');
        expect(statusStyle).not.toContain('shadow');
        expect(statusStyle).not.toContain('elevation');
    });
});
