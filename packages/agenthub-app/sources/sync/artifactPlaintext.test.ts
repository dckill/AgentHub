import { describe, expect, it } from 'vitest';
import { projectArtifactPlaintext } from './artifactPlaintext';

describe('projectArtifactPlaintext', () => {
    it('preserves a legitimate empty string instead of treating it as missing', () => {
        expect(projectArtifactPlaintext('')).toBe('');
    });

    it('normalizes only nullish decryption results to null', () => {
        expect(projectArtifactPlaintext(null)).toBeNull();
        expect(projectArtifactPlaintext(undefined)).toBeNull();
        expect(projectArtifactPlaintext('content')).toBe('content');
    });
});
