import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app/(app)/transfers.tsx'), 'utf8');

describe('transfer account lifecycle boundary', () => {
    it('binds directory permission and reset actions to the current account generation', () => {
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;');
        expect(source).toContain('requestDirectoryPermissionsAsync(initialUri)');
        expect(source).toContain('if (!isCurrent()) {');
    });

    it('does not clear or remove transfer tasks after an account switch', () => {
        expect(source).toContain('clearCompletedTasks(currentFilter);');
        expect(source).toContain('removeTask(task.id, { deleteLocalFile: decision.deleteLocalFile })');
        expect(source).toContain('if (!decision?.confirmed || !isCurrent()) {');
        expect(source).toContain('if (result === null) {');
    });
});
