export type NativeUpdateStatus =
    | { available: true; updateUrl: string }
    | { available: false };

/** Normalize the unauthenticated update endpoint response and fail closed. */
export function parseNativeUpdateResponse(data: unknown): NativeUpdateStatus {
    if (!data || typeof data !== 'object') {
        return { available: false };
    }

    const payload = data as { update_required?: unknown; update_url?: unknown };
    if (payload.update_required !== true || typeof payload.update_url !== 'string') {
        return { available: false };
    }

    const updateUrl = payload.update_url.trim();
    return updateUrl ? { available: true, updateUrl } : { available: false };
}
