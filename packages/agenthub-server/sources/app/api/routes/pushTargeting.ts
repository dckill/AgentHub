export type PushTarget = {
    id: string;
    token: string;
    deviceId: string | null;
    createdAt: number;
    updatedAt: number;
};

/** Keep legacy tokens (without deviceId) while excluding the active device. */
export function filterPushTargetsForActiveDevice(
    targets: PushTarget[],
    activeDeviceId: string | null | undefined,
    activeUiDeviceIds: ReadonlySet<string> = new Set(),
): PushTarget[] {
    if (!activeDeviceId || !activeUiDeviceIds.has(activeDeviceId)) return targets;
    return targets.filter((target) => target.deviceId === null || target.deviceId !== activeDeviceId);
}
