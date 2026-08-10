import { describe, expect, it } from 'vitest';
import { buildLifecycleThinkingSessionUpdate } from './lifecycleThinkingProjection';

describe('buildLifecycleThinkingSessionUpdate', () => {
    const session = { id: 'session-1', thinking: false, thinkingAt: 10, draft: 'keep me' };

    it('does not produce an update when state is unavailable or session is absent', () => {
        expect(buildLifecycleThinkingSessionUpdate(undefined, true, 20)).toBeNull();
        expect(buildLifecycleThinkingSessionUpdate(session, null, 20)).toBeNull();
    });

    it('does not produce an update when thinking state is unchanged', () => {
        expect(buildLifecycleThinkingSessionUpdate(session, false, 20)).toBeNull();
    });

    it('preserves local fields when thinking state changes', () => {
        expect(buildLifecycleThinkingSessionUpdate(session, true, 20)).toEqual({
            ...session,
            thinking: true,
            thinkingAt: 20,
        });
    });
});
