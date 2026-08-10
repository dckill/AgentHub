import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(appSources, relativePath), 'utf8');

describe('MultiTextInput accessibility boundary', () => {
    it('exposes an explicit native label with placeholder fallback', () => {
        const source = read('components/MultiTextInput.tsx');

        expect(source).toContain('accessibilityLabel?: string;');
        expect(source).toContain('accessibilityHint?: string;');
        expect(source).toContain('accessibilityLabel={accessibilityLabel ?? placeholder}');
        expect(source).toContain('accessibilityHint={accessibilityHint}');
    });

    it('maps the same label contract to the web textarea', () => {
        const source = read('components/MultiTextInput.web.tsx');

        expect(source).toContain('accessibilityLabel?: string;');
        expect(source).toContain('accessibilityHint?: string;');
        expect(source).toContain('aria-label={accessibilityLabel ?? placeholder}');
        expect(source).toContain('aria-description={accessibilityHint}');
    });
});
