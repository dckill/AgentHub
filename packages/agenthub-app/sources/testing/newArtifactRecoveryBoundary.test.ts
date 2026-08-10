import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const handlerSource = fs.readFileSync(
    path.resolve(__dirname, '../sync/newArtifactRealtimeHandler.ts'),
    'utf8',
);

describe('new-artifact recovery boundary', () => {
    it('refreshes the artifact snapshot when the data key cannot be decrypted', () => {
        expect(handlerSource).toMatch(/Failed to decrypt key for new artifact[\s\S]{0,220}params\.invalidateArtifacts\(\);/);
    });

    it('refreshes the artifact snapshot after header or body processing fails', () => {
        expect(handlerSource).toMatch(/newArtifactResult\.kind === 'error'[\s\S]{0,180}params\.invalidateArtifacts\(\);/);
    });
});
