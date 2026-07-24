import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { activateOnSpaceKey } from './keyboardActivationCore';

describe('web keyboard activation', () => {
    it('activates Space exactly once and prevents page scrolling', () => {
        const activate = vi.fn();
        const preventDefault = vi.fn();

        expect(activateOnSpaceKey({ key: ' ', preventDefault }, activate)).toBe(true);
        expect(activate).toHaveBeenCalledTimes(1);
        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('leaves Enter to the native Pressable activation path', () => {
        const activate = vi.fn();

        expect(activateOnSpaceKey({ nativeEvent: { key: 'Enter' } }, activate)).toBe(false);
        expect(activate).not.toHaveBeenCalled();
    });

    it('connects every radio Pressable to the shared Space boundary', () => {
        const sources = path.resolve(__dirname, '..');
        const files = [
            'components/SelectRow.tsx',
            'components/ScaleSlider.tsx',
            'components/glass/SegmentedControl.tsx',
            'components/usage/UsagePanel.tsx',
            'app/(app)/new/index.tsx',
        ];

        for (const file of files) {
            const source = fs.readFileSync(path.join(sources, file), 'utf8');
            expect(source, file).toContain('getSpaceKeyActivationProps');
        }
    });
});
