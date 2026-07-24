import { describe, expect, it } from 'vitest';
import { shouldReportSyncError } from './syncErrorReporting';

describe('shouldReportSyncError', () => {
    it('keeps unexpected and online failures visible', () => {
        expect(shouldReportSyncError(new Error('invalid encrypted payload'), false)).toBe(true);
        expect(shouldReportSyncError(new TypeError('Failed to fetch'), true)).toBe(true);
    });

    it('does not promote cancellation or an expected browser-offline fetch failure to console.error', () => {
        expect(shouldReportSyncError(new DOMException('stale request', 'AbortError'), true)).toBe(false);
        expect(shouldReportSyncError(new TypeError('Failed to fetch'), false)).toBe(false);
        expect(shouldReportSyncError(new Error('Network request failed'), false)).toBe(false);
    });
});
