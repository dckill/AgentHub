import { describe, expect, it } from 'vitest';
import { buildUserMessageContent } from './sendMessageContent';

describe('buildUserMessageContent', () => {
    it('builds the canonical user text record and preserves optional display metadata', () => {
        expect(buildUserMessageContent({
            text: 'hello',
            displayText: 'hello\nworld',
            fileReferences: ['file-1'],
            sentFrom: 'android',
            turnOriginDevice: 'device-1',
            permissionMode: 'default',
            model: 'claude-sonnet',
            effort: 'high',
            appendSystemPrompt: 'system',
        })).toEqual({
            role: 'user',
            content: { type: 'text', text: 'hello' },
            meta: {
                sentFrom: 'android',
                turnOriginDevice: 'device-1',
                permissionMode: 'default',
                model: 'claude-sonnet',
                effort: 'high',
                fallbackModel: null,
                appendSystemPrompt: 'system',
                displayText: 'hello\nworld',
                fileReferences: ['file-1'],
            },
        });
    });

    it('omits empty optional metadata while keeping the protocol fallback model', () => {
        expect(buildUserMessageContent({
            text: 'hello',
            sentFrom: 'web',
            turnOriginDevice: 'device-1',
            permissionMode: 'read-only',
            model: null,
            effort: null,
            appendSystemPrompt: '',
        })).toEqual({
            role: 'user',
            content: { type: 'text', text: 'hello' },
            meta: {
                sentFrom: 'web',
                turnOriginDevice: 'device-1',
                permissionMode: 'read-only',
                model: null,
                effort: null,
                fallbackModel: null,
                appendSystemPrompt: '',
            },
        });
    });
});
