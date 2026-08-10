import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '../app/(app)/dev/expo-constants.tsx'),
    'utf8',
);

describe('Expo Constants developer screen accessibility boundary', () => {
    it('names the expandable JSON section and keeps copy as a separate button', () => {
        expect(source).toContain('accessibilityRole="button"');
        expect(source).toContain('accessibilityLabel={isExpanded ? `Collapse ${title}` : `Expand ${title}`}');
        expect(source).toContain('accessibilityLabel={`Copy ${title} JSON`}');
    });
});
