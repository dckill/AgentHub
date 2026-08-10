export type OlderMessagesLifecycleParams<Request> = {
    runRequest: (operation: (request: Request) => Promise<number>) => Promise<number>;
    runInLock: (operation: () => Promise<number>) => Promise<number>;
    runPage: (request: Request) => Promise<number>;
    isCurrent: () => boolean;
    onFailure: () => void;
    onResetLoading: () => void;
};

/** Run one older-message page with exactly-once failure recovery across request and lock setup. */
export async function runOlderMessagesLifecycle<Request>(
    params: OlderMessagesLifecycleParams<Request>,
): Promise<number> {
    let requestEnteredHandler = false;
    try {
        return await params.runRequest(async (request) => params.runInLock(async () => {
            requestEnteredHandler = true;
            try {
                return await params.runPage(request);
            } catch (error) {
                params.onFailure();
                if (params.isCurrent()) {
                    params.onResetLoading();
                }
                throw error;
            }
        }));
    } catch (error) {
        if (!requestEnteredHandler) {
            params.onFailure();
            if (params.isCurrent()) {
                params.onResetLoading();
            }
        }
        throw error;
    }
}
