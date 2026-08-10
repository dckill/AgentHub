import { describe, expect, it } from 'vitest';
import { AgentStateSchema, MetadataSchema } from './sessionState';
import { historicalAgentStateSample, historicalMetadataSample } from './sessionStateSamples';

describe('cross-package historical session samples', () => {
    it('parses the shared metadata sample without dropping optional fields', () => {
        const metadata = MetadataSchema.parse(historicalMetadataSample);

        expect(metadata).toMatchObject({
            currentModelCode: 'gpt-5',
            lifecycleState: 'running',
            sandbox: null,
            officialMirror: { provider: 'codex', id: 'thread-1' },
        });
    });

    it('parses legacy and current permission fields from the shared state sample', () => {
        const state = AgentStateSchema.parse(historicalAgentStateSample);
        const request = state.completedRequests?.['permission-1'];

        expect(request).toMatchObject({
            allowTools: ['Bash', 'Read'],
            allowedTools: ['Bash', 'Read'],
            createdAt: 1710000000000,
            completedAt: 1710000001000,
        });
    });
});
