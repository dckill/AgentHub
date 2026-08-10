import { describe, expect, it } from 'vitest';
import {
    classifyCodexRawNotification,
    extractCodexTurnId,
    extractCodexTurnStatus,
} from './codexNotificationRouting';

describe('codex raw notification routing', () => {
    it('classifies lifecycle, item and thread metadata notifications', () => {
        expect(classifyCodexRawNotification('turn/started')).toBe('turn-started');
        expect(classifyCodexRawNotification('turn/completed')).toBe('turn-completed');
        expect(classifyCodexRawNotification('thread/status/changed')).toBe('thread-status');
        expect(classifyCodexRawNotification('thread/goal/updated')).toBe('thread-goal-updated');
        expect(classifyCodexRawNotification('thread/goal/cleared')).toBe('thread-goal-cleared');
        expect(classifyCodexRawNotification('thread/tokenUsage/updated')).toBe('token-usage');
        expect(classifyCodexRawNotification('item/started')).toBe('item');
        expect(classifyCodexRawNotification('unknown/event')).toBeNull();
    });

    it('extracts compatible turn id and status fields without trusting malformed values', () => {
        expect(extractCodexTurnId({ turn: { id: 'turn-1' } })).toBe('turn-1');
        expect(extractCodexTurnId({ turnId: 'turn-2' })).toBe('turn-2');
        expect(extractCodexTurnId({ turn_id: 'turn-3' })).toBe('turn-3');
        expect(extractCodexTurnId({ turn: { id: 3 } })).toBeNull();
        expect(extractCodexTurnStatus({ turn: { status: 'completed' } })).toBe('completed');
        expect(extractCodexTurnStatus({ status: 'aborted' })).toBe('aborted');
        expect(extractCodexTurnStatus({ status: '' })).toBeNull();
    });
});
