import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(
    path.resolve(__dirname, '..', 'components', relativePath),
    'utf8',
);

describe('AgentInput text field boundary', () => {
    it('keeps MultiTextInput wiring behind a dedicated field component', () => {
        const input = read('AgentInput.tsx');
        const field = read('AgentInputTextField.tsx');

        expect(input).toContain("import { AgentInputTextField } from './AgentInputTextField';");
        expect(input).toContain('<AgentInputTextField');
        expect(input).not.toMatch(/<MultiTextInput[\s\n]/);
        expect(field).toContain('<MultiTextInput');
        expect(field).toContain('onStateChange');
        expect(field).toContain('onKeyPress');
    });
});
