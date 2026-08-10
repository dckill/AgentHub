import { describe, expect, it } from 'vitest';
import { RawRecordSchema } from './typesRaw';
import { createAttachmentFileRecord } from './attachmentMessage';

describe('createAttachmentFileRecord', () => {
    it('creates a valid user file event with image dimensions', () => {
        const record = createAttachmentFileRecord({
            ref: 'sessions/s1/attachments/a.enc',
            name: 'photo.png',
            size: 123,
            mimeType: 'image/png',
            width: 640,
            height: 480,
        }, 'event-1', 1234);

        expect(RawRecordSchema.parse(record)).toEqual(record);
        if (record.role !== 'session') throw new Error('expected session record');
        expect(record.content.data).toMatchObject({
            role: 'user',
            ev: {
                t: 'file',
                ref: 'sessions/s1/attachments/a.enc',
                mimeType: 'image/png',
                image: { width: 640, height: 480 },
            },
        });
    });

    it('omits incomplete image dimensions', () => {
        const record = createAttachmentFileRecord({
            ref: 'sessions/s1/attachments/a.enc',
            name: 'photo.png',
            size: 123,
            mimeType: 'image/png',
            width: 640,
        }, 'event-1', 1234);

        if (record.role !== 'session') throw new Error('expected session record');
        expect(record.content.data.ev).not.toHaveProperty('image');
    });
});
