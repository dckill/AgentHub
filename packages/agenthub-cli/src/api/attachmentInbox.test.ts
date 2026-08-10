import { describe, expect, it } from 'vitest';
import { attachDecodedImages, parseIncomingImageAttachment } from './attachmentInbox';

describe('attachment inbox', () => {
    it('accepts only user image file envelopes with complete ownership metadata', () => {
        const record = {
            role: 'session',
            content: { type: 'session', data: {
                role: 'user',
                ev: { t: 'file', ref: 'sessions/s1/attachments/a.enc', name: 'a.png', size: 3, mimeType: 'image/png', image: { width: 10, height: 20 } },
            } },
        };
        expect(parseIncomingImageAttachment(record)).toEqual({
            ref: 'sessions/s1/attachments/a.enc', name: 'a.png', size: 3, mimeType: 'image/png', width: 10, height: 20,
        });
        expect(parseIncomingImageAttachment({ ...record, role: 'agent' })).toBeNull();
    });

    it('binds downloaded bytes to exactly the following user message', () => {
        const message = { role: 'user' as const, content: { type: 'text' as const, text: 'inspect' }, localKey: 'm1' };
        const attached = attachDecodedImages(message, [{ data: new Uint8Array([1, 2, 3]), mimeType: 'image/png', name: 'a.png' }]);
        expect(attached.meta?.images).toEqual([{ data: 'AQID', mimeType: 'image/png', name: 'a.png' }]);
        expect('meta' in message).toBe(false);
    });
});
