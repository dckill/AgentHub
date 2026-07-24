import { describe, expect, it } from 'vitest';

import {
    LARGE_FILE_CONFIRMATION_BYTES,
    MAX_CONFIRMED_FILE_LOAD_BYTES,
    buildBase64DataUri,
    classifyFilePreview,
    getConfirmedFileReadLimit,
    isDecodedContentBinary,
    shouldConfirmLargeFile,
} from './filePreviewPolicy';

describe('filePreviewPolicy', () => {
    it('classifies common image files as previewable images', () => {
        expect(classifyFilePreview('/tmp/screenshot.PNG')).toEqual({ kind: 'image', mimeType: 'image/png' });
        expect(classifyFilePreview('/tmp/photo.jpeg')).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
        expect(classifyFilePreview('/tmp/icon.svg')).toEqual({ kind: 'svg', mimeType: 'image/svg+xml' });
    });

    it('classifies known binary files as binary instead of loading them as text', () => {
        expect(classifyFilePreview('/tmp/archive.zip')).toEqual({ kind: 'binary' });
        expect(classifyFilePreview('/tmp/app.db')).toEqual({ kind: 'binary' });
    });

    it('treats source and config files as text', () => {
        expect(classifyFilePreview('/tmp/App.tsx')).toEqual({ kind: 'text' });
        expect(classifyFilePreview('/tmp/package.json')).toEqual({ kind: 'text' });
    });

    it('asks for confirmation when a response is truncated or larger than 2 MB', () => {
        expect(LARGE_FILE_CONFIRMATION_BYTES).toBe(2 * 1024 * 1024);
        expect(shouldConfirmLargeFile({ truncated: true })).toBe(true);
        expect(shouldConfirmLargeFile({ totalSize: LARGE_FILE_CONFIRMATION_BYTES + 1 })).toBe(true);
        expect(shouldConfirmLargeFile({ totalSize: LARGE_FILE_CONFIRMATION_BYTES })).toBe(false);
    });

    it('caps confirmed large-file reads to a mobile-safe upper bound', () => {
        expect(MAX_CONFIRMED_FILE_LOAD_BYTES).toBe(32 * 1024 * 1024);
        expect(getConfirmedFileReadLimit(LARGE_FILE_CONFIRMATION_BYTES + 1)).toBe(LARGE_FILE_CONFIRMATION_BYTES + 1);
        expect(getConfirmedFileReadLimit(MAX_CONFIRMED_FILE_LOAD_BYTES + 1)).toBe(MAX_CONFIRMED_FILE_LOAD_BYTES);
        expect(getConfirmedFileReadLimit()).toBe(MAX_CONFIRMED_FILE_LOAD_BYTES);
    });

    it('builds image data uris from base64 content', () => {
        expect(buildBase64DataUri('abc123', 'image/png')).toBe('data:image/png;base64,abc123');
    });

    it('detects decoded binary content without treating empty text as binary', () => {
        expect(isDecodedContentBinary(new Uint8Array(), '')).toBe(false);
        expect(isDecodedContentBinary(new Uint8Array([65, 0, 66]), 'A\0B')).toBe(true);
        expect(isDecodedContentBinary(new Uint8Array([65, 10, 66]), 'A\nB')).toBe(false);
    });
});
