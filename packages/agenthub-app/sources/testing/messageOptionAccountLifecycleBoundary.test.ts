import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'components/MessageView.tsx'), 'utf8');

describe('Message option account lifecycle boundary', () => {
    it('binds user and agent option sends to the originating account generation', () => {
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('request: () => sync.sendMessage(sessionId, title, { source: \'option\' })');
        expect(source).toContain('sendMessageOption(props.sessionId, option.title);');
    });
});
