import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '../components/AgentInputRadioOption.tsx'),
    'utf8',
);

describe('agent input radio option boundary', () => {
    it('keeps a reusable labelled radio option contract', () => {
        expect(source).toContain('accessibilityRole="radio"');
        expect(source).toContain('accessibilityLabel={label}');
        expect(source).toContain('accessibilityState={{ checked: selected }}');
        expect(source).toContain('aria-checked={selected}');
    });

    it('supports an optional description without changing the option label', () => {
        expect(source).toContain('description?: string');
        expect(source).toContain('{description && (');
    });
});
