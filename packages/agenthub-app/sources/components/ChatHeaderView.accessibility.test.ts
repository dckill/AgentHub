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

    it('keeps every header metadata badge on one fixed horizontal row', () => {
        const source = fs.readFileSync(path.resolve(__dirname, 'ChatHeaderView.tsx'), 'utf8');

        expect(source).toMatch(/<View style=\{styles\.metadataRow\}>[\s\S]{0,2400}!!agentLabel[\s\S]{0,2400}!!lifecycleStatus/);
        expect(source).toMatch(/metadataRow:\s*\{[\s\S]{0,180}height: 18,[\s\S]{0,180}flexDirection: 'row',[\s\S]{0,180}overflow: 'hidden'/);
        expect(source).not.toContain('styles.agentRow');
    });

    it('uses a plain hit target for the back arrow without a circular glass outline', () => {
        const source = fs.readFileSync(path.resolve(__dirname, 'ChatHeaderView.tsx'), 'utf8');

        expect(source).not.toContain('styles.mobileBackGlass');
        expect(source).not.toContain('mobileBackGlass:');
        expect(source).toMatch(/style=\{styles\.backButton\}[\s\S]{0,160}hitSlop=\{15\}/);
    });
});
