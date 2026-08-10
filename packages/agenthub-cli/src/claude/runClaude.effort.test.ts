import { describe, expect, it } from 'vitest';
import { buildClaudeMessageModeHash } from './runClaude';

describe('Claude message effort routing', () => {
    it('keeps different effort selections in distinct queue modes', () => {
        const base = { permissionMode: 'default' as const, model: 'opus' };
        expect(buildClaudeMessageModeHash({ ...base, effort: 'high' }))
            .not.toBe(buildClaudeMessageModeHash({ ...base, effort: 'xhigh' }));
    });
});
