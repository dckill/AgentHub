/** Resolve the protocol source label used for a locally authored message. */
export function resolveSentFrom(platform: string, isMac: boolean): string {
    if (platform === 'web') return 'web';
    if (platform === 'android') return 'android';
    if (platform === 'ios') return isMac ? 'mac' : 'ios';
    return 'web';
}
