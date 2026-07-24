import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ChatHeaderView lifecycle accessibility', () => {
    it('exposes lifecycle changes as one polite native live region', () => {
        const source = fs.readFileSync(path.resolve(__dirname, 'ChatHeaderView.tsx'), 'utf8');

        expect(source).toContain('accessible={lifecycleStatus.accessible}');
        expect(source).toContain('accessibilityLiveRegion={lifecycleStatus.accessibilityLiveRegion}');
        expect(source).toContain('accessibilityLabel={lifecycleStatus.label}');
    });
});
