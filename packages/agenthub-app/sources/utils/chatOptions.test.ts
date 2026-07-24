import { describe, expect, it } from 'vitest';
import { getInteractiveOptionsMessageId } from './chatOptions';
import type { Message } from '@/sync/typesMessage';

function agent(id: string, createdAt: number, text: string, isThinking = false): Message {
    return { kind: 'agent-text', id, localId: null, createdAt, text, isThinking };
}

function user(id: string, createdAt: number, text = '继续'): Message {
    return { kind: 'user-text', id, localId: null, createdAt, text };
}

describe('chatOptions', () => {
    it('keeps options visible only when the newest message is an options agent reply', () => {
        const messages = [
            agent('latest-options', 30, '请选择：\n<options>\n<option>开始执行</option>\n</options>'),
            user('older-user', 20),
            agent('older-options', 10, '<options>\n<option>旧建议</option>\n</options>'),
        ];

        expect(getInteractiveOptionsMessageId(messages)).toBe('latest-options');
    });

    it('hides old options after a newer user message is sent', () => {
        const messages = [
            user('latest-user', 30),
            agent('older-options', 20, '<options>\n<option>旧建议</option>\n</options>'),
        ];

        expect(getInteractiveOptionsMessageId(messages)).toBeNull();
    });

    it('ignores thinking messages and agent text without options', () => {
        expect(getInteractiveOptionsMessageId([
            agent('thinking', 30, '<options>\n<option>不要显示</option>\n</options>', true),
            agent('older-options', 20, '<options>\n<option>旧建议</option>\n</options>'),
        ])).toBeNull();

        expect(getInteractiveOptionsMessageId([
            agent('plain', 30, '没有建议'),
            agent('older-options', 20, '<options>\n<option>旧建议</option>\n</options>'),
        ])).toBeNull();
    });
});
