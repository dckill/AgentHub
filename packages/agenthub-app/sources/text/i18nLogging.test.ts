import { describe, expect, it } from 'vitest';
import { shouldLogI18n } from './i18nLogging';

describe('i18n logging policy', () => {
    it('keeps locale resolution logs disabled unless explicitly requested', () => {
        expect(shouldLogI18n({})).toBe(false);
        expect(shouldLogI18n({ EXPO_PUBLIC_AGENTHUB_I18N_DEBUG: '0' })).toBe(false);
        expect(shouldLogI18n({ EXPO_PUBLIC_AGENTHUB_I18N_DEBUG: '1' })).toBe(true);
    });
});
