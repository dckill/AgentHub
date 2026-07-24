import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(__dirname, '..');
const imageRoot = resolve(sourceRoot, 'assets/images');

function collectRuntimeSources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__testdata__' ? [] : collectRuntimeSources(path);
        }
        if (!['.ts', '.tsx'].includes(extname(entry.name)) || /\.(?:test|spec)\.[^.]+$/.test(entry.name)) {
            return [];
        }
        return [path];
    });
}

describe('runtime image asset boundary', () => {
    it('does not export byte-identical PNGs through different runtime aliases', () => {
        const aliasesByHash = new Map<string, Set<string>>();

        for (const sourcePath of collectRuntimeSources(sourceRoot)) {
            const source = readFileSync(sourcePath, 'utf8');
            for (const match of source.matchAll(/require\(['"]@\/assets\/images\/([^'"]+\.png)['"]\)/g)) {
                const alias = match[1];
                const imagePath = resolve(imageRoot, alias);
                expect(existsSync(imagePath), `${relative(sourceRoot, sourcePath)} references ${alias}`).toBe(true);
                const hash = createHash('sha256').update(readFileSync(imagePath)).digest('hex');
                const aliases = aliasesByHash.get(hash) ?? new Set<string>();
                aliases.add(alias);
                aliasesByHash.set(hash, aliases);
            }
        }

        const duplicateAliases = [...aliasesByHash.values()]
            .filter((aliases) => aliases.size > 1)
            .map((aliases) => [...aliases].sort())
            .sort((left, right) => left[0].localeCompare(right[0]));

        expect(duplicateAliases).toEqual([]);
    });
});
