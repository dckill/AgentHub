export type SessionLifecycleState = 'archiveRequested' | 'exited' | 'timeout' | 'not-found' | 'archived';
export type SessionLifecycleTone = 'warning' | 'muted' | 'success';

export interface SessionLifecycleVisual {
    lifecycleState: SessionLifecycleState;
    tone: SessionLifecycleTone;
    accessible: true;
    accessibilityLiveRegion: 'polite';
    labelKey:
        | 'sessionInfo.lifecycleStopping'
        | 'sessionInfo.lifecycleRunnerStopped'
        | 'sessionInfo.lifecycleStopTimedOut'
        | 'sessionInfo.lifecycleRunnerUnavailable'
        | 'sessionInfo.lifecycleArchived';
    icon: 'time-outline' | 'alert-circle-outline' | 'archive-outline' | 'checkmark-circle-outline';
}

/**
 * Converts daemon/server lifecycle metadata into a small, stable UI contract.
 * Unknown and ordinary running states intentionally remain invisible so this
 * does not change the normal session header or interaction flow.
 */
export function getSessionLifecycleVisual(lifecycleState?: string): SessionLifecycleVisual | null {
    switch (lifecycleState) {
        case 'archiveRequested': return { lifecycleState, tone: 'warning', labelKey: 'sessionInfo.lifecycleStopping', icon: 'time-outline', accessible: true, accessibilityLiveRegion: 'polite' };
        case 'exited': return { lifecycleState, tone: 'muted', labelKey: 'sessionInfo.lifecycleRunnerStopped', icon: 'checkmark-circle-outline', accessible: true, accessibilityLiveRegion: 'polite' };
        case 'timeout': return { lifecycleState, tone: 'warning', labelKey: 'sessionInfo.lifecycleStopTimedOut', icon: 'alert-circle-outline', accessible: true, accessibilityLiveRegion: 'polite' };
        case 'not-found': return { lifecycleState, tone: 'muted', labelKey: 'sessionInfo.lifecycleRunnerUnavailable', icon: 'alert-circle-outline', accessible: true, accessibilityLiveRegion: 'polite' };
        case 'archived': return { lifecycleState, tone: 'success', labelKey: 'sessionInfo.lifecycleArchived', icon: 'archive-outline', accessible: true, accessibilityLiveRegion: 'polite' };
        default: return null;
    }
}
