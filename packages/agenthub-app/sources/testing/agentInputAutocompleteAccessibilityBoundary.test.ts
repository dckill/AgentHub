import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '../components/AgentInputAutocomplete.tsx'),
    'utf8',
);

describe('Agent input autocomplete accessibility boundary', () => {
    it('gives each suggestion a stable spoken label and selection state', () => {
        expect(source).toContain('accessibilityLabel={`Suggestion ${index + 1}`}');
        expect(source).toContain('accessibilityRole="button"');
        expect(source).toContain('accessibilityState={{ selected: selectedIndex === index }}');
    });
});
