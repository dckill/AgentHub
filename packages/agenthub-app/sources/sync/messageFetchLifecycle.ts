import type { SessionMessageLoadError } from './sessionMessageLoadState';

export type MessageFetchLifecycleParams<Request> = {
    runRequest: (operation: (request: Request) => Promise<void>) => Promise<void>;
    runInLock: (operation: () => Promise<void>) => Promise<void>;
    runPage: (request: Request) => Promise<void>;
    classifyError: (error: unknown) => SessionMessageLoadError | null;
    isCurrent: () => boolean;
    applyLoadError: (error: SessionMessageLoadError) => void;
};

/** Run the message fetch under account/ingest lifecycles and project only current non-abort failures. */
export async function runMessageFetchLifecycle<Request>(
    params: MessageFetchLifecycleParams<Request>,
): Promise<void> {
    try {
        await params.runRequest(async (request) => params.runInLock(() => params.runPage(request)));
    } catch (error) {
        const loadError = params.classifyError(error);
        if (loadError && params.isCurrent()) {
            params.applyLoadError(loadError);
        }
        throw error;
    }
}
