import { describe, expect, it } from 'vitest';
import { OFFICIAL_RESUME_PENDING_TIMEOUT_MS, shouldKeepOfficialResumePending } from './officialResumePending';

describe('shouldKeepOfficialResumePending', () => {
    it('clears official resume pending as soon as messages finish loading, even when history is empty', () => {
        expect(shouldKeepOfficialResumePending({
            startedAt: 1_000,
            now: 1_200,
            messagesLoaded: true,
        })).toBe(false);
    });

    it('keeps official resume pending briefly while message sync has not completed', () => {
        expect(shouldKeepOfficialResumePending({
            startedAt: 1_000,
            now: 1_000 + OFFICIAL_RESUME_PENDING_TIMEOUT_MS - 1,
            messagesLoaded: false,
        })).toBe(true);
    });

    it('clears official resume pending after the timeout even if message sync is still waiting', () => {
        expect(shouldKeepOfficialResumePending({
            startedAt: 1_000,
            now: 1_000 + OFFICIAL_RESUME_PENDING_TIMEOUT_MS,
            messagesLoaded: false,
        })).toBe(false);
    });
});
