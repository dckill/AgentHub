import { describe, expect, it } from 'vitest';
import { shouldMarkVisibleSessionCompletionViewed } from './visibleSessionCompletionView';

describe('shouldMarkVisibleSessionCompletionViewed', () => {
    it('marks a visible completed session viewed when it has an unviewed completion', () => {
        expect(shouldMarkVisibleSessionCompletionViewed({
            state: 'waiting',
            hasUnviewedCompletion: true,
        })).toBe(true);
    });

    it('does not mark busy, disconnected, or already viewed sessions', () => {
        expect(shouldMarkVisibleSessionCompletionViewed({
            state: 'thinking',
            hasUnviewedCompletion: true,
        })).toBe(false);
        expect(shouldMarkVisibleSessionCompletionViewed({
            state: 'permission_required',
            hasUnviewedCompletion: true,
        })).toBe(false);
        expect(shouldMarkVisibleSessionCompletionViewed({
            state: 'disconnected',
            hasUnviewedCompletion: true,
        })).toBe(false);
        expect(shouldMarkVisibleSessionCompletionViewed({
            state: 'waiting',
            hasUnviewedCompletion: false,
        })).toBe(false);
    });
});
