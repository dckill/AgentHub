export type NativeUpdateRequest = { signal: AbortSignal };

export type NativeUpdateFetchApplicationParams<Request extends NativeUpdateRequest = NativeUpdateRequest, Status = unknown> = {
    runRequest: (operation: (request: Request) => Promise<Status | null>) => Promise<Status | null>;
    fetchUpdate: (request: Request) => Promise<Status | null>;
    assertCurrent: () => void;
    isCurrent: () => boolean;
    applyStatus: (status: Status | null) => void;
    reportError: (error: unknown) => void;
};

/** Apply a native update response only within the account generation that requested it. */
export async function runNativeUpdateFetchApplication<
    Request extends NativeUpdateRequest,
    Status,
>(params: NativeUpdateFetchApplicationParams<Request, Status>): Promise<void> {
    try {
        const status = await params.runRequest(params.fetchUpdate);
        if (status) {
            params.assertCurrent();
            params.applyStatus(status);
        }
    } catch (error) {
        if (!params.isCurrent()) {
            return;
        }
        params.reportError(error);
        params.applyStatus(null);
    }
}
