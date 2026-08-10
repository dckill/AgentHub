import { describe, expect, it } from 'vitest';
import { areArtifactSessionsEqual } from './artifactSessions';

describe('areArtifactSessionsEqual', () => {
    it('treats equal ordered session ids as unchanged', () => {
        expect(areArtifactSessionsEqual(['s1', 's2'], ['s1', 's2'])).toBe(true);
    });

    it('detects order, membership, and undefined changes', () => {
        expect(areArtifactSessionsEqual(['s1', 's2'], ['s2', 's1'])).toBe(false);
        expect(areArtifactSessionsEqual(['s1'], ['s1', 's2'])).toBe(false);
        expect(areArtifactSessionsEqual(undefined, [])).toBe(false);
    });
});
