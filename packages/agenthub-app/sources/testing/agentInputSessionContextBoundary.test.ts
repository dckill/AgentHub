import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/AgentInput.tsx', import.meta.url), 'utf8');
const propsContract = source.slice(
    source.indexOf('interface AgentInputProps'),
    source.indexOf('const stylesheet'),
);

describe('AgentInput session context prop boundary', () => {
    it('groups session identity, metadata, and machine/path context into one contract', () => {
        expect(source).toContain('export interface AgentInputSessionContext');
        expect(source).toContain('sessionContext?: AgentInputSessionContext;');
        expect(propsContract).not.toMatch(/^    sessionId\?:/m);
        expect(propsContract).not.toMatch(/^    metadata\?: Metadata/m);
        expect(propsContract).not.toMatch(/^    agentType\?:/m);
        expect(propsContract).not.toMatch(/^    machineName\?:/m);
        expect(propsContract).not.toMatch(/^    currentPath\?:/m);
    });
});
