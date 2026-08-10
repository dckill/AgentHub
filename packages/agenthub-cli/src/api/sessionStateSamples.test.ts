import { describe, expect, it } from 'vitest';
import type { AgentState, Metadata } from './types';
import { historicalAgentStateSample, historicalMetadataSample } from '../../../agenthub-wire/src/sessionStateSamples';

describe('CLI historical session samples', () => {
    it('keeps the shared metadata sample assignable to the CLI runtime contract', () => {
        const metadata: Metadata = historicalMetadataSample;
        expect(metadata.agentHubHomeDir).toBe('/home/user/.agenthub');
        expect(metadata.officialMirror?.provider).toBe('codex');
    });

    it('keeps legacy and current permission aliases in the CLI contract', () => {
        const state: AgentState = {
            ...historicalAgentStateSample,
            completedRequests: {
                'permission-1': {
                    ...historicalAgentStateSample.completedRequests['permission-1'],
                    mode: 'safe-yolo',
                },
            },
        };
        expect(state.completedRequests?.['permission-1']?.allowTools).toEqual(['Bash', 'Read']);
        expect(state.completedRequests?.['permission-1']?.allowedTools).toEqual(['Bash', 'Read']);
    });
});
