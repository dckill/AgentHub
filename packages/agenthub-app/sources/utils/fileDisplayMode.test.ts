import { describe, expect, it } from 'vitest';

import { resolveFileDisplayModeAfterContentUpdate } from './fileDisplayMode';

describe('resolveFileDisplayModeAfterContentUpdate', () => {
    it('keeps the user selected file view when diff and file content finish loading later', () => {
        expect(resolveFileDisplayModeAfterContentUpdate('file', {
            hasDiffContent: true,
            hasFileContent: true,
            requestedLine: null,
            userSelectedDisplayMode: true,
        })).toBe('file');
    });

    it('defaults to diff only while the user has not selected a view', () => {
        expect(resolveFileDisplayModeAfterContentUpdate('file', {
            hasDiffContent: true,
            hasFileContent: true,
            requestedLine: null,
            userSelectedDisplayMode: false,
        })).toBe('diff');
    });

    it('uses the file view for direct line links even when a diff is available', () => {
        expect(resolveFileDisplayModeAfterContentUpdate('diff', {
            hasDiffContent: true,
            hasFileContent: true,
            requestedLine: 42,
            userSelectedDisplayMode: false,
        })).toBe('file');
    });
});
