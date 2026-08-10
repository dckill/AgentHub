import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = path.resolve(__dirname, '../components');
const agentInputSource = fs.readFileSync(path.join(componentsDir, 'AgentInput.tsx'), 'utf8');

describe('agent input reference chips boundary', () => {
    it('owns project and local file reference chip projections outside AgentInput', () => {
        const chipsPath = path.join(componentsDir, 'AgentInputReferenceChips.tsx');
        expect(fs.existsSync(chipsPath)).toBe(true);

        const chipsSource = fs.readFileSync(chipsPath, 'utf8');
        expect(chipsSource).toContain('fileReferences');
        expect(chipsSource).toContain('localFiles');
        expect(chipsSource).toContain('onFileReferencesChange');
        expect(chipsSource).toContain('onLocalFileRemove');
    });

    it('keeps AgentInput responsible only for passing reference state and callbacks', () => {
        expect(agentInputSource).toContain("import { AgentInputReferenceChips } from './AgentInputReferenceChips';");
        expect(agentInputSource).toContain('<AgentInputReferenceChips');
        expect(agentInputSource).not.toContain('props.fileReferences!.filter');
        expect(agentInputSource).not.toContain('props.localFiles!.findIndex');
    });
});
