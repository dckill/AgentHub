import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(sources, relativePath), 'utf8');

describe('session fork experience boundary', () => {
    it('exposes both full-session fork and rewind-based duplicate actions', () => {
        const quickActions = read('hooks/useSessionQuickActions.ts');

        expect(quickActions).toContain("id: 'fork-session'");
        expect(quickActions).toContain("id: 'duplicate-session'");
        expect(quickActions).toContain('await forkAndSpawn(forkSource)');
        expect(quickActions).toContain('showDuplicateSheet({ sessionId: session.id })');
        expect(quickActions).toContain('isMachineOnline(machine)');
    });

    it('keeps the rewind picker operational across loading, failure, empty and submitting states', () => {
        const sheet = read('components/DuplicateSheet.tsx');

        expect(sheet).toContain("import { sync } from '@/sync/sync';");
        expect(sheet).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(sheet).toContain('const generation = sync.getAccountGeneration();');
        expect(sheet).toContain('runSessionActionRequest({');
        expect(sheet).toContain('claudeListRewindPoints');
        expect(sheet).toContain('codexListRewindPoints');
        expect(sheet).toContain("accessibilityRole=\"radio\"");
        expect(sheet).toContain("t('common.retry')");
        expect(sheet).toContain("t('session.duplicateSheetEmpty')");
        expect(sheet).toContain('accessibilityState={{ disabled: !selected || submitting }}');
        expect(sheet).toContain('cutAfterItemId: selected.id');
        expect(sheet).toContain('cutAfterUuid: selected.id');
        expect(sheet).toContain('router.replace(`/session/${result.sessionId}`)');
    });

    it('uses exact provider rewind identities from a user-message long press', () => {
        const message = read('components/MessageView.tsx');

        expect(message).toContain('onLongPress: handleDuplicateFromMessage');
        expect(message).toContain('initialRewindPointId: props.message.codexItemId ?? props.message.claudeUuid');
        expect(message).toContain('initialForkedFromMessageId: props.message.id');
        expect(message).toContain("accessibilityHint: t('session.duplicateMessageHint')");
    });
});
