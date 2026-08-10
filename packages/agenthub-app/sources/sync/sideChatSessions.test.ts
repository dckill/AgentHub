import { describe, expect, it } from 'vitest';
import { isTopLevelSession, selectSideChatSessions } from './sideChatSessions';
import type { Session } from './storageTypes';

const session = (id: string, metadata: Record<string, unknown> = {}, createdAt = 1): Session => ({
    id, seq: 0, createdAt, updatedAt: createdAt, active: true,
    metadata: { path: '/repo', host: 'host', ...metadata },
    agentState: null,
} as Session);

describe('side chat session projection', () => {
    it('隐藏 side chat，仅保留普通 fork 在主会话列表', () => {
        expect(isTopLevelSession(session('normal'))).toBe(true);
        expect(isTopLevelSession(session('fork', { parentSessionId: 'parent' }))).toBe(true);
        expect(isTopLevelSession(session('side', { parentSessionId: 'parent', isSideChat: true }))).toBe(false);
    });

    it('只选择指定父会话的未归档 side chat 并稳定按创建时间排序', () => {
        const result = selectSideChatSessions([
            session('later', { parentSessionId: 'parent', isSideChat: true }, 20),
            session('other', { parentSessionId: 'other', isSideChat: true }, 5),
            session('archived', { parentSessionId: 'parent', isSideChat: true, lifecycleState: 'archived' }, 3),
            session('first', { parentSessionId: 'parent', isSideChat: true }, 10),
        ], 'parent');
        expect(result.map((item) => item.id)).toEqual(['first', 'later']);
    });
});
