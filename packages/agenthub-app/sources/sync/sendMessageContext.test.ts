import { describe, expect, it } from 'vitest';
import { resolveSendMessageContext } from './sendMessageContext';

describe('resolveSendMessageContext', () => {
    it('uses the sandbox permission fallback and normalizes default modes', () => {
        const result = resolveSendMessageContext({
            session: {
                permissionMode: 'default',
                modelMode: 'default',
                effortLevel: undefined,
                metadata: { path: '/tmp/project', host: 'test-host', sandbox: { enabled: true } },
            },
        });

        expect(result).toMatchObject({
            permissionMode: 'bypassPermissions',
            model: null,
            effort: null,
            source: 'chat',
        });
    });

    it('preserves explicit session modes and message options', () => {
        const result = resolveSendMessageContext({
            session: {
                permissionMode: 'acceptEdits',
                modelMode: 'claude-3-7-sonnet',
                effortLevel: 'high',
                metadata: null,
            },
            options: {
                displayText: 'shown',
                fileReferences: ['file-1'],
                images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
                source: 'question',
            },
        });

        expect(result).toEqual({
            permissionMode: 'acceptEdits',
            model: 'claude-3-7-sonnet',
            effort: 'high',
            displayText: 'shown',
            fileReferences: ['file-1'],
            images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
            source: 'question',
        });
    });
});
