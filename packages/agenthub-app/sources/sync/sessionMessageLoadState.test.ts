import { describe, expect, it } from 'vitest';

import {
    classifySessionMessageLoadError,
    resolveSessionMessagePlaceholder,
} from './sessionMessageLoadState';

describe('session message load state', () => {
    it('classifies timeout/network failures but ignores account cancellation', () => {
        const timeout = new Error('slow');
        timeout.name = 'TimeoutError';

        expect(classifySessionMessageLoadError(timeout)).toBe('timeout');
        expect(classifySessionMessageLoadError(new TypeError('offline'))).toBe('network');
        expect(classifySessionMessageLoadError(new DOMException('stale', 'AbortError'))).toBeNull();
    });

    it('projects loading, recoverable error and empty-ready states without hiding cached messages', () => {
        expect(resolveSessionMessagePlaceholder({ messageCount: 0, isLoaded: false, loadError: null })).toBe('loading');
        expect(resolveSessionMessagePlaceholder({ messageCount: 0, isLoaded: false, loadError: 'timeout' })).toBe('timeout');
        expect(resolveSessionMessagePlaceholder({ messageCount: 0, isLoaded: false, loadError: 'network' })).toBe('network');
        expect(resolveSessionMessagePlaceholder({ messageCount: 0, isLoaded: true, loadError: null })).toBe('empty');
        expect(resolveSessionMessagePlaceholder({ messageCount: 1, isLoaded: false, loadError: 'timeout' })).toBeNull();
    });
});
