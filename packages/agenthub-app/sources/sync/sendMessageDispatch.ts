export type SendMessageDispatchResult = {
    sent: boolean;
    failedAttachments: number;
};

export type SendMessageDispatchParams<Context, Image, Attachment, Content> = {
    text: string;
    images?: Image[];
    context: Context;
    uploadAttachments: (images: Image[]) => Promise<{ failed: number; uploaded: Attachment[] }>;
    enqueueAttachments: (attachments: Attachment[]) => Promise<void>;
    buildContent: (context: Context) => Content;
    enqueueText: (content: Content) => Promise<void>;
    complete: () => void;
    isCurrent?: () => boolean;
};

/** Preserve the send ordering: upload/project attachments, enqueue text, then run completion effects. */
export async function dispatchSendMessage<Context, Image, Attachment, Content>(
    params: SendMessageDispatchParams<Context, Image, Attachment, Content>,
): Promise<SendMessageDispatchResult> {
    const isCurrent = params.isCurrent ?? (() => true);
    if (!isCurrent()) return { sent: false, failedAttachments: 0 };
    let failedAttachments = 0;
    if (params.images && params.images.length > 0) {
        const attachmentResult = await params.uploadAttachments(params.images);
        failedAttachments = attachmentResult.failed;
        if (!isCurrent()) return { sent: false, failedAttachments };
        await params.enqueueAttachments(attachmentResult.uploaded);
        if (!isCurrent()) return { sent: false, failedAttachments };
        if (attachmentResult.uploaded.length === 0 && params.text.trim().length === 0) {
            return { sent: false, failedAttachments };
        }
    }

    await params.enqueueText(params.buildContent(params.context));
    if (!isCurrent()) return { sent: false, failedAttachments };
    params.complete();
    return { sent: true, failedAttachments };
}
