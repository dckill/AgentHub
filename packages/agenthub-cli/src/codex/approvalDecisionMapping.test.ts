import { describe, expect, it } from 'vitest';

import {
    mapCodexDecisionToMcpElicitationResponse,
    mapCodexDecisionToWire,
} from './approvalDecisionMapping';
import type { ReviewDecision } from './codexAppServerTypes';

describe('mapCodexDecisionToWire', () => {
    it('preserves legacy decisions and maps v2 decisions', () => {
        expect(mapCodexDecisionToWire('approved', true)).toBe('approved');
        expect(mapCodexDecisionToWire('approved_for_session', true)).toBe('approved_for_session');
        expect(mapCodexDecisionToWire('denied', true)).toBe('denied');
        expect(mapCodexDecisionToWire('abort', true)).toBe('abort');
        expect(mapCodexDecisionToWire('approved', false)).toBe('accept');
        expect(mapCodexDecisionToWire('approved_for_session', false)).toBe('acceptForSession');
        expect(mapCodexDecisionToWire('denied', false)).toBe('decline');
        expect(mapCodexDecisionToWire('abort', false)).toBe('cancel');
    });

    it('passes through execpolicy amendment objects and fail-closes unknown variants', () => {
        const amendment: ReviewDecision = {
            approved_execpolicy_amendment: { proposed_execpolicy_amendment: ['allow'] },
        };
        expect(mapCodexDecisionToWire(amendment, false)).toEqual(amendment);
        expect(mapCodexDecisionToWire({} as ReviewDecision, true)).toBe('denied');
        expect(mapCodexDecisionToWire({} as ReviewDecision, false)).toBe('decline');
    });
});

describe('mapCodexDecisionToMcpElicitationResponse', () => {
    it('accepts form mode with an empty content object', () => {
        expect(mapCodexDecisionToMcpElicitationResponse('approved', { mode: 'form' })).toEqual({
            action: 'accept',
            content: {},
            _meta: null,
        });
        expect(mapCodexDecisionToMcpElicitationResponse('approved_for_session', { mode: 'url' })).toEqual({
            action: 'accept',
            content: null,
            _meta: null,
        });
    });

    it('maps abort, denial, and object decisions to fail-closed responses', () => {
        expect(mapCodexDecisionToMcpElicitationResponse('abort', {})).toEqual({ action: 'cancel', content: null, _meta: null });
        expect(mapCodexDecisionToMcpElicitationResponse('denied', {})).toEqual({ action: 'decline', content: null, _meta: null });
        expect(mapCodexDecisionToMcpElicitationResponse({} as ReviewDecision, {})).toEqual({ action: 'decline', content: null, _meta: null });
    });
});
