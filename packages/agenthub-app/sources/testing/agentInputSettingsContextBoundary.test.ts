import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/AgentInput.tsx', import.meta.url), 'utf8');
const propsContract = source.slice(
    source.indexOf('interface AgentInputProps'),
    source.indexOf('const stylesheet'),
);

describe('AgentInput settings prop boundary', () => {
    it('groups permission, model, and effort selection into one contract', () => {
        expect(source).toContain('export interface AgentInputSettingsContext');
        expect(source).toContain('settings?: AgentInputSettingsContext;');
        expect(propsContract).not.toMatch(/^    permissionMode\??:/m);
        expect(propsContract).not.toMatch(/^    availableModes\??:/m);
        expect(propsContract).not.toMatch(/^    modelMode\??:/m);
        expect(propsContract).not.toMatch(/^    availableModels\??:/m);
        expect(propsContract).not.toMatch(/^    effortLevel\??:/m);
        expect(propsContract).not.toMatch(/^    availableEffortLevels\??:/m);
    });
});
