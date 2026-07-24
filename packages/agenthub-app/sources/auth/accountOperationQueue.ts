export interface AccountOperationQueue {
    run<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Serializes account mutations while allowing one failed mutation to leave
 * the queue usable for the next login/logout/server switch operation.
 */
export function createAccountOperationQueue(): AccountOperationQueue {
    let tail: Promise<void> = Promise.resolve();

    return {
        run<T>(operation: () => Promise<T>): Promise<T> {
            const result = tail.then(operation, operation);
            tail = result.then(() => undefined, () => undefined);
            return result;
        },
    };
}
