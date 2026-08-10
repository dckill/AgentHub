import { describe, expect, it } from 'vitest';
import { detectAttachmentImageMime } from './attachmentImageMime';

describe('detectAttachmentImageMime', () => {
    it('detects supported image formats from bytes instead of trusting metadata', () => {
        expect(detectAttachmentImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
        expect(detectAttachmentImageMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
        expect(detectAttachmentImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif');
        expect(detectAttachmentImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
        expect(detectAttachmentImageMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    });
});
