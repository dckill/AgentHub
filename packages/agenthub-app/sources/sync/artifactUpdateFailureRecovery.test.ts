import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('artifact update failure recovery', () => {
    it('invalidates the artifacts sync when an encrypted field fails', () => {
        const source = readFileSync(resolve(__dirname, 'updateArtifactRealtimeHandler.ts'), 'utf8');
        expect(source).toMatch(/onFieldError: \(field, error\) => \{[\s\S]*?params\.assertCurrent\(\);[\s\S]*?params\.invalidateArtifacts\(\);/);
    });
});
