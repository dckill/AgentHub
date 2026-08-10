import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('artifact update recovery boundary', () => {
    it('invalidates artifact sync when applying an update throws', () => {
        const source = readFileSync(resolve(__dirname, 'updateArtifactRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/artifactResult\.kind === 'error'[\s\S]*?params\.invalidateArtifacts\(\);/);
    });
});
