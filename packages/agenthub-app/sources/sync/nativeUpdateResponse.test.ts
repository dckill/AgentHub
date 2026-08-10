import { describe, expect, it } from 'vitest';

import { parseNativeUpdateResponse } from './nativeUpdateResponse';

describe('parseNativeUpdateResponse', () => {
    it('returns an available update only for a required update with a non-empty URL', () => {
        expect(parseNativeUpdateResponse({ update_required: true, update_url: ' https://example.com/app.apk ' })).toEqual({
            available: true,
            updateUrl: 'https://example.com/app.apk',
        });
    });

    it('fails closed for missing, non-boolean, or non-string update fields', () => {
        expect(parseNativeUpdateResponse(null)).toEqual({ available: false });
        expect(parseNativeUpdateResponse({ update_required: 'true', update_url: 'https://example.com' })).toEqual({ available: false });
        expect(parseNativeUpdateResponse({ update_required: true, update_url: 42 })).toEqual({ available: false });
        expect(parseNativeUpdateResponse({ update_required: true, update_url: '   ' })).toEqual({ available: false });
    });

    it('does not advertise an update when the server says no update is required', () => {
        expect(parseNativeUpdateResponse({ update_required: false, update_url: 'https://example.com' })).toEqual({ available: false });
    });
});
