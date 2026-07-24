import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Session info lifecycle accessibility', () => {
    it('keeps daemon lifecycle feedback visible and exposes it as a polite live region', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../app/(app)/session/[id]/info.tsx'),
            'utf8',
        );

        expect(source).toContain('getSessionLifecycleVisual(archiveLifecycleState');
        expect(source).toContain('accessibilityLiveRegion={archiveLifecycleVisual.accessibilityLiveRegion}');
        expect(source).toContain('accessibilityLabel={archiveLifecycleLabel}');
        expect(source).toContain('getArchiveFeedbackNavigationDelayMs(stopResult.state)');
    });
});
