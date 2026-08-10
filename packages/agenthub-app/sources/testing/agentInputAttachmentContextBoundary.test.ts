import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../components/AgentInput.tsx', import.meta.url), 'utf8');
const propsContract = source.slice(
    source.indexOf('interface AgentInputProps'),
    source.indexOf('const stylesheet'),
);

describe('AgentInput attachment context prop boundary', () => {
    it('groups file references, local files, and file actions into one contract', () => {
        expect(source).toContain('export interface AgentInputAttachmentContext');
        expect(source).toContain('attachments?: AgentInputAttachmentContext;');
        expect(propsContract).not.toMatch(/^    fileReferences\??:/m);
        expect(propsContract).not.toMatch(/^    onFileReferencesChange\??:/m);
        expect(propsContract).not.toMatch(/^    onFilePickerOpen\??:/m);
        expect(propsContract).not.toMatch(/^    localFiles\??:/m);
        expect(propsContract).not.toMatch(/^    onLocalFileRemove\??:/m);
        expect(propsContract).not.toMatch(/^    onLocalFilePick\??:/m);
        expect(propsContract).not.toMatch(/^    onFileViewerPress\??:/m);
    });
});
