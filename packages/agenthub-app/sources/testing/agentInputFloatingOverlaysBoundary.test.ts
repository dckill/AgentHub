import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(
    path.resolve(__dirname, '..', 'components', relativePath),
    'utf8',
);

describe('AgentInput floating overlays boundary', () => {
    it('keeps attachment and slash menus behind a dedicated overlay boundary', () => {
        const input = read('AgentInput.tsx');
        const overlays = read('AgentInputFloatingOverlays.tsx');

        expect(input).toContain("import { AgentInputFloatingOverlays } from './AgentInputFloatingOverlays';");
        expect(input).toContain('<AgentInputFloatingOverlays');
        expect(input).not.toContain("import { AttachmentMenu } from './AttachmentMenu';");
        expect(input).not.toContain("import { SlashCommandMenu } from './SlashCommandMenu';");
        expect(overlays).toContain('AttachmentMenu');
        expect(overlays).toContain('SlashCommandMenu');
        expect(overlays).toContain('onProjectFiles');
        expect(overlays).toContain('onSelect');
    });
});
