import type { SessionState } from '@/utils/sessionUtils';

export function shouldMarkVisibleSessionCompletionViewed(input: {
    state: SessionState;
    hasUnviewedCompletion: boolean;
}): boolean {
    return input.state === 'waiting' && input.hasUnviewedCompletion;
}
