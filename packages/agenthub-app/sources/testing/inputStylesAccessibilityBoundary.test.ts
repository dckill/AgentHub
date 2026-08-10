import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    'sources/app/(app)/dev/input-styles.tsx',
    'utf8',
);

describe('developer input styles gallery accessibility boundary', () => {
    it('renders static preview controls as non-interactive views', () => {
        expect(source).toContain('Pressable as InteractivePressable');
        expect(source).toContain('const PreviewPressable = View;');
        expect(source).not.toMatch(/<Pressable\b/);
    });

    it('keeps the style selector as the only interactive preview surface', () => {
        expect(source).toMatch(
            /<InteractivePressable[\s\S]{0,500}onPress=\{\(\) => setSelectedStyle\(style\.id\)\}/,
        );
    });
});
