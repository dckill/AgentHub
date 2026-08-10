import { describe, expect, it } from 'vitest';
import { normalizeArtifactHeader } from './artifactHeader';

describe('normalizeArtifactHeader', () => {
    it('preserves title, linked sessions and draft state', () => {
        expect(normalizeArtifactHeader({
            title: 'Notes',
            sessions: ['s1', 's2'],
            draft: true,
        })).toEqual({ title: 'Notes', sessions: ['s1', 's2'], draft: true });
    });

    it('normalizes invalid optional header fields without dropping the title', () => {
        expect(normalizeArtifactHeader({
            title: 42,
            sessions: ['s1', 2],
            draft: 'yes',
        })).toEqual({ title: null });
    });

    it('rejects non-object decrypted values', () => {
        expect(normalizeArtifactHeader(null)).toBeNull();
        expect(normalizeArtifactHeader('header')).toBeNull();
    });
});
