/** Return an action response only when the account that started it is still current. */
export async function runSessionActionRequest<T>({
    isCurrent,
    request,
}: {
    isCurrent: () => boolean;
    request: () => Promise<T>;
}): Promise<T | null> {
    if (!isCurrent()) {
        return null;
    }

    const result = await request();
    if (!isCurrent()) {
        return null;
    }

    return result;
}
