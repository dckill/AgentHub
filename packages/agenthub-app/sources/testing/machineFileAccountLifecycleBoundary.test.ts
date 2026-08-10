import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const folderBrowserSource = readFileSync(join(__dirname, '..', 'components/FolderBrowser.tsx'), 'utf8');
const machineFilesSource = readFileSync(join(__dirname, '..', 'app/(app)/machine/[id]/files.tsx'), 'utf8');

describe('Machine file account lifecycle boundary', () => {
    it('fails closed for stale directory reads and folder creation', () => {
        expect(folderBrowserSource).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(folderBrowserSource).toContain('const generation = sync.getAccountGeneration();');
        expect(folderBrowserSource).toContain('request: () => machineListDirectory(machineId, path)');
        expect(folderBrowserSource).toContain('request: () => machineCreateDirectory(machineId, newPath)');
        expect(folderBrowserSource).toContain('if (result === null || !isCurrent()) return;');
    });

    it('does not delete a remote file after account generation changes', () => {
        expect(machineFilesSource).toContain('const generation = sync.getAccountGeneration();');
        expect(machineFilesSource).toContain('const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;');
        expect(machineFilesSource).toContain('request: () => machineDeleteFile(machineId, node.path)');
        expect(machineFilesSource).toContain('if (result === null || !isCurrent()) return;');
        expect(machineFilesSource).toContain('if (!confirmed || !isCurrent()) return;');
    });
});
