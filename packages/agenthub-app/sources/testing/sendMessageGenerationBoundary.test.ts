import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('send message generation boundary', () => {
    it('binds control preparation and pre-dispatch checks to the account generation', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', 'sync/sync.ts'),
            'utf8',
        );
        const lifecycleSource = fs.readFileSync(
            path.resolve(__dirname, '..', 'sync/sendMessageLifecycle.ts'),
            'utf8',
        );

        expect(source).toMatch(/async sendMessage\(sessionId: string, text: string, options\?: SendMessageOptions\): Promise<SendMessageResult> \{[\s\S]*?const generation = this\.requireAccountGeneration\(\);[\s\S]*?const isCurrent = \(\) => this\.accountLifecycle\.isCurrent\(generation\);/);
        expect(source).toMatch(/return runSendMessageLifecycle\(\{[\s\S]*?isCurrent,[\s\S]*?prepare: async \(\) =>/);
        expect(source).toMatch(/prepareSendMessage\(\{[\s\S]*?ensureControl: \(initial\) => ensureSendControl\(\{[\s\S]*?isCurrent,[\s\S]*?\}\),[\s\S]*?isCurrent,/);
        expect(source).toMatch(/uploadAttachments: async \(imageInputs\) => uploadImageAttachments\(\{[\s\S]*?isCurrent,[\s\S]*?\}\),/);
        expect(source).toMatch(/return dispatchSendMessage\(\{[\s\S]*?isCurrent,[\s\S]*?\}\);/);
        expect(source).toMatch(/enqueueAttachments: \(attachments\) => enqueueUploadedAttachments\(\{[\s\S]*?isCurrent,[\s\S]*?\}\),/);
        expect(source).toMatch(/enqueueText: \(content\) => enqueueTextMessage\(\{[\s\S]*?isCurrent,[\s\S]*?\}\)\.then/);
        expect(lifecycleSource).toContain('if (!isCurrent()) {');
        expect(lifecycleSource).toContain('return { sent: false, failedAttachments: result.failedAttachments };');
    });
});
