import { describe, expect, it, vi } from 'vitest';
import { dispatchSendMessage } from './sendMessageDispatch';

describe('dispatchSendMessage', () => {
    it('queues text and completes after the text outbox succeeds', async () => {
        const events: string[] = [];
        const enqueueText = vi.fn(async () => { events.push('text'); });
        const complete = vi.fn(() => { events.push('complete'); });

        await expect(dispatchSendMessage({
            text: 'hello',
            context: { source: 'chat' },
            uploadAttachments: vi.fn(),
            enqueueAttachments: vi.fn(),
            buildContent: (context) => ({ ...context, text: 'hello' }),
            enqueueText,
            complete,
        })).resolves.toEqual({ sent: true, failedAttachments: 0 });
        expect(events).toEqual(['text', 'complete']);
    });

    it('preserves partial attachment failures and still sends text', async () => {
        const enqueueAttachments = vi.fn(async () => undefined);
        const enqueueText = vi.fn(async () => undefined);
        const attachments = [{ id: 'file-1' }];

        await expect(dispatchSendMessage({
            text: 'with image',
            images: [{ name: 'image.png' }],
            context: { source: 'chat' },
            uploadAttachments: vi.fn(async () => ({ failed: 1, uploaded: attachments })),
            enqueueAttachments,
            buildContent: (context) => ({ ...context, text: 'with image' }),
            enqueueText,
            complete: vi.fn(),
        })).resolves.toEqual({ sent: true, failedAttachments: 1 });
        expect(enqueueAttachments).toHaveBeenCalledWith(attachments);
        expect(enqueueText).toHaveBeenCalledTimes(1);
    });

    it('does not enqueue a blank text when every attachment upload fails', async () => {
        const enqueueText = vi.fn(async () => undefined);
        const complete = vi.fn();

        await expect(dispatchSendMessage({
            text: '   ',
            images: [{ name: 'image.png' }],
            context: { source: 'chat' },
            uploadAttachments: vi.fn(async () => ({ failed: 1, uploaded: [] })),
            enqueueAttachments: vi.fn(async () => undefined),
            buildContent: (context) => context,
            enqueueText,
            complete,
        })).resolves.toEqual({ sent: false, failedAttachments: 1 });
        expect(enqueueText).not.toHaveBeenCalled();
        expect(complete).not.toHaveBeenCalled();
    });

    it('stops before local attachment projection when the account becomes stale after upload', async () => {
        let currentGeneration = true;
        const enqueueAttachments = vi.fn(async () => undefined);
        const enqueueText = vi.fn(async () => undefined);
        const complete = vi.fn();

        await expect(dispatchSendMessage({
            text: 'with image',
            images: [{ name: 'image.png' }],
            context: { source: 'chat' },
            uploadAttachments: vi.fn(async () => {
                currentGeneration = false;
                return { failed: 0, uploaded: [{ id: 'file-1' }] };
            }),
            enqueueAttachments,
            buildContent: (context) => context,
            enqueueText,
            complete,
            isCurrent: () => currentGeneration,
        })).resolves.toEqual({ sent: false, failedAttachments: 0 });
        expect(enqueueAttachments).not.toHaveBeenCalled();
        expect(enqueueText).not.toHaveBeenCalled();
        expect(complete).not.toHaveBeenCalled();
    });
});
