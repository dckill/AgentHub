import { describe, expect, it } from 'vitest';
import { agentHubBrand, getAgentHubAppVariant } from './brand';

describe('AgentHub brand definition', () => {
    it('defines user-facing AgentHub names without touching internal package names', () => {
        expect(agentHubBrand.productName).toBe('AgentHub');
        expect(agentHubBrand.displayName.production).toBe('AgentHub');
        expect(agentHubBrand.displayName.preview).toBe('AgentHub (preview)');
        expect(agentHubBrand.slug).toBe('agenthub');
        expect(agentHubBrand.scheme).toBe('agenthub');
    });

    it('falls back to development for unknown app variants', () => {
        expect(getAgentHubAppVariant(undefined)).toBe('development');
        expect(getAgentHubAppVariant('local')).toBe('development');
        expect(getAgentHubAppVariant('preview')).toBe('preview');
        expect(getAgentHubAppVariant('production')).toBe('production');
    });
});
