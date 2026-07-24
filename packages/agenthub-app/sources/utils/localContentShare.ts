type SharePayload = {
    message: string;
    title: string;
};

type ShareResult = {
    action?: string;
} | void;

export type LocalShareOutcome = 'shared' | 'dismissed' | 'empty';

export async function shareLocalContent(options: {
    text: string;
    title: string;
    share: (payload: SharePayload) => Promise<ShareResult>;
}): Promise<LocalShareOutcome> {
    if (!options.text.trim()) {
        return 'empty';
    }

    try {
        const result = await options.share({
            message: options.text,
            title: options.title,
        });
        return result?.action === 'dismissedAction'
            ? 'dismissed'
            : 'shared';
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return 'dismissed';
        }
        throw error;
    }
}
