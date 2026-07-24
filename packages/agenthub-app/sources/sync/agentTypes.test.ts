import { describe, expect, it } from 'vitest';
import { coerceSupportedClientAgent, isSupportedClientAgent, SUPPORTED_CLIENT_AGENTS } from './agentTypes';

describe('agentTypes', () => {
    it('exposes only Claude Code and Codex as supported client agents', () => {
        expect(SUPPORTED_CLIENT_AGENTS).toEqual(['claude', 'codex']);
        expect(isSupportedClientAgent('claude')).toBe(true);
        expect(isSupportedClientAgent('codex')).toBe(true);
        expect(isSupportedClientAgent('legacy-provider')).toBe(false);
        expect(isSupportedClientAgent('unknown')).toBe(false);
    });

    it('coerces legacy or unknown agent values to Claude Code', () => {
        expect(coerceSupportedClientAgent('legacy-provider')).toBe('claude');
        expect(coerceSupportedClientAgent('unknown')).toBe('claude');
        expect(coerceSupportedClientAgent(null)).toBe('claude');
    });
});
