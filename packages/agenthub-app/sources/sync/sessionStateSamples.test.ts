import { describe, expect, it } from 'vitest';
import { AgentStateSchema, MetadataSchema } from './storageTypes';
import { historicalAgentStateSample, historicalMetadataSample } from '../../../agenthub-wire/src/sessionStateSamples';

describe('App historical session samples', () => {
    it('accepts the shared metadata sample with its optional fields intact', () => {
        const metadata = MetadataSchema.parse(historicalMetadataSample);

        expect(metadata.officialMirror).toEqual({ provider: 'codex', id: 'thread-1' });
        expect(metadata.sandbox).toBeNull();
    });

    it('accepts both permission field spellings from the shared state sample', () => {
        const state = AgentStateSchema.parse(historicalAgentStateSample);
        expect(state.completedRequests?.['permission-1']?.allowTools).toEqual(['Bash', 'Read']);
        expect(state.completedRequests?.['permission-1']?.allowedTools).toEqual(['Bash', 'Read']);
    });
});
