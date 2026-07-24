import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('artifact failure recovery boundary', () => {
    it('propagates fetch, authentication, and decryption failures instead of returning an empty artifact', () => {
        const sync = read('sync/sync.ts');
        const start = sync.indexOf('public async fetchArtifactWithBody');
        const end = sync.indexOf('public async createArtifact', start);
        const method = sync.slice(start, end);

        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        expect(method).toContain('Promise<DecryptedArtifact>');
        expect(method).toContain("throw new Error('Not authenticated')");
        expect(method).toContain("throw new Error(`Failed to decrypt key for artifact ${artifactId}`)");
        expect(method).not.toContain('catch (error)');
        expect(method).not.toContain('return null');
    });

    it('keeps detail loading retries user-driven and never projects a failed fetch as empty content', () => {
        const detail = read('app/(app)/artifacts/[id].tsx');

        expect(detail).toContain('const [loadAttempt, setLoadAttempt] = React.useState(0);');
        expect(detail).toContain('const handleRetry = React.useCallback(() => {');
        expect(detail).toContain('setLoadAttempt((attempt) => attempt + 1);');
        expect(detail).toContain('<GlassButton');
        expect(detail).toContain("title={t('common.retry')}");
        expect(detail).toContain('onPress={handleRetry}');
        expect(detail).toContain('[id, artifact?.id, artifact?.body, loadAttempt]');
        expect(detail).not.toContain('[id, artifact]);');
    });

    it('blocks the edit form on fetch failure and retries without losing the server baseline', () => {
        const edit = read('app/(app)/artifacts/edit/[id].tsx');

        expect(edit).toContain('const [loadError, setLoadError] = React.useState<string | null>(null);');
        expect(edit).toContain('const [loadAttempt, setLoadAttempt] = React.useState(0);');
        expect(edit).toContain('const [baseline, setBaseline] = React.useState<ArtifactEditBaseline | null>(null);');
        expect(edit).toContain('storage.getState().updateArtifact(fullArtifact);');
        expect(edit).toContain('const titleChanged = (title || null) !== baseline.title;');
        expect(edit).toContain('const bodyChanged = (body || null) !== baseline.body;');
        expect(edit).toContain('if (loadError) {');
        expect(edit).toContain('<GlassButton');
        expect(edit).toContain("title={t('common.retry')}");
        expect(edit).toContain('onPress={handleRetry}');
        expect(edit).toContain('[id, artifact?.id, artifact?.body, loadAttempt]');
        expect(edit).not.toContain('[id, artifact]);');
    });

    it('preserves create and edit input state and the stored artifact when mutations fail', () => {
        const create = read('app/(app)/artifacts/new.tsx');
        const edit = read('app/(app)/artifacts/edit/[id].tsx');
        const detail = read('app/(app)/artifacts/[id].tsx');

        expect(create).toMatch(/catch \(err\) \{[\s\S]{0,260}setIsSaving\(false\);/);
        expect(create).not.toMatch(/catch \(err\) \{[\s\S]{0,260}setTitle\(''\)/);
        expect(create).not.toMatch(/catch \(err\) \{[\s\S]{0,260}setBody\(''\)/);
        expect(edit).toMatch(/catch \(err\) \{[\s\S]{0,280}setIsSaving\(false\);/);
        expect(edit).not.toMatch(/catch \(err\) \{[\s\S]{0,280}setTitle\(''\)/);
        expect(edit).not.toMatch(/catch \(err\) \{[\s\S]{0,280}setBody\(''\)/);
        expect(detail).toMatch(/await deleteArtifact\(credentials, id\);\s*storage\.getState\(\)\.deleteArtifact\(id\);/);
    });
});
