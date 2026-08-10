import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'hooks/useAttachmentImage.ts'),
    'utf8',
);

describe('attachment image account boundary', () => {
    it('scopes cache and in-flight attachment work to the current account generation', () => {
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('generation !== null');
        expect(source).toContain('loadAttachment(sessionId, ref, generation)');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        expect(source).toContain('if (!cancelled && sync.getAccountGeneration() === generation)');
    });
});
