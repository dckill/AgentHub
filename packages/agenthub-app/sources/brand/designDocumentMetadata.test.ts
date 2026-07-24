import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentHubConfigManifest } from './configManifest';

const repoRoot = join(__dirname, '..', '..', '..', '..');

function readDesignMetadata() {
    const content = readFileSync(join(repoRoot, 'design', 'Design.md'), 'utf8');
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    return Object.fromEntries(
        frontmatter
            .split('\n')
            .map((line) => line.match(/^([a-z_]+):\s*(.+)$/))
            .filter((match): match is RegExpMatchArray => Boolean(match))
            .map((match) => [match[1], match[2].replace(/^"|"$/g, '')]),
    );
}

describe('AgentHub design document metadata', () => {
    it('marks the design source as the implemented AgentHub 1.0 baseline', () => {
        const metadata = readDesignMetadata();

        expect(metadata.design_system).toBe('AgentHub Amber Crystal');
        expect(metadata.version).toBe(agentHubConfigManifest.expo.version);
        expect(metadata.status).toBe('implemented');
        expect(metadata.updated).toBe('2026-07-05');
    });
});
