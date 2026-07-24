import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'RoundButton.tsx'), 'utf8');

describe('RoundButton accessibility boundary', () => {
    it('exposes its visible title through the shared button semantics', () => {
        expect(source).toContain("import { getAccessibleActionProps } from './accessibilityProps';");
        expect(source).toContain('...getAccessibleActionProps(String(props.title ?? \'\'), {');
    });

    it('publishes loading and disabled state without changing the press guard', () => {
        expect(source).toContain('disabled: Boolean(doLoading || props.disabled)');
        expect(source).toContain('busy: Boolean(doLoading)');
        expect(source).toContain('disabled={doLoading || props.disabled}');
    });
});
