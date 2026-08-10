import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('InvertedListTest accessibility boundary', () => {
    it('names every list and padding strategy control and exposes selection state', () => {
        const source = read('app/(app)/dev/inverted-list.tsx');

        for (const label of ['FlashList', 'FlatList', 'LegendList', 'Animated', 'Non-Animated', 'Header/Footer', 'Send']) {
            expect(source).toContain(`accessibilityLabel="${label}"`);
        }
        expect(source).toContain('accessibilityRole="radio"');
        expect(source).toContain('accessibilityState={{ selected: listType ===');
        expect(source).toContain('accessibilityState={{ selected: paddingType ===');
    });

    it('names the message composer input', () => {
        const source = read('app/(app)/dev/inverted-list.tsx');

        expect(source).toContain('accessibilityLabel="Message"');
        expect(source).toContain('accessibilityRole="button"');
    });
});
