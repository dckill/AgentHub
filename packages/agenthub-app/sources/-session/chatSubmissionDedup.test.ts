import { describe, expect, it } from 'vitest';
import { createChatSubmissionDeduper } from './chatSubmissionDedup';

describe('createChatSubmissionDeduper', () => {
    it('rejects an immediate duplicate chat payload for the same session', () => {
        const deduper = createChatSubmissionDeduper();
        const payload = {
            sessionId: 'session-1',
            text: 'hello',
            displayText: undefined,
            fileReferences: [],
            localFiles: [],
        };

        expect(deduper.accept(payload, 1_000)).toBe(true);
        expect(deduper.accept(payload, 1_050)).toBe(false);
    });

    it('allows the same text after the duplicate window has passed', () => {
        const deduper = createChatSubmissionDeduper({ duplicateWindowMs: 750 });
        const payload = {
            sessionId: 'session-1',
            text: 'hello',
            displayText: undefined,
            fileReferences: [],
            localFiles: [],
        };

        expect(deduper.accept(payload, 1_000)).toBe(true);
        expect(deduper.accept(payload, 1_751)).toBe(true);
    });

    it('allows the same text in another session immediately', () => {
        const deduper = createChatSubmissionDeduper();

        expect(deduper.accept({
            sessionId: 'session-1',
            text: 'hello',
            displayText: undefined,
            fileReferences: [],
            localFiles: [],
        }, 1_000)).toBe(true);
        expect(deduper.accept({
            sessionId: 'session-2',
            text: 'hello',
            displayText: undefined,
            fileReferences: [],
            localFiles: [],
        }, 1_050)).toBe(true);
    });
});
