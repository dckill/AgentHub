import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');
const sourceRoot = resolve(appRoot, 'sources');

function collectSourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__testdata__' ? [] : collectSourceFiles(path);
        }
        if (!['.ts', '.tsx'].includes(extname(entry.name)) || /\.(?:test|spec)\.[^.]+$/.test(entry.name)) {
            return [];
        }
        return [path];
    });
}

describe('production vector icon bundle boundary', () => {
    it('keeps the unauthenticated home header independent from the full Ionicons font', () => {
        const homeHeader = readFileSync(resolve(sourceRoot, 'components/HomeHeader.tsx'), 'utf8');

        expect(homeHeader).not.toContain('@expo/vector-icons/Ionicons');
        expect(homeHeader).toContain("from 'react-native-svg'");
        expect(homeHeader).toContain("getAccessibleActionProps(t('project.newSession'))");
        expect(homeHeader).toContain("getAccessibleActionProps(t('server.serverConfiguration'))");
    });

    it('uses per-family entry points instead of exporting every icon font', () => {
        const barrelImports = collectSourceFiles(sourceRoot).flatMap((path) => {
            const source = readFileSync(path, 'utf8');
            return source.includes("from '@expo/vector-icons'")
                ? [relative(appRoot, path)]
                : [];
        });

        expect(barrelImports).toEqual([]);
    });

    it('does not ship the full MaterialCommunityIcons catalog for three Git glyphs', () => {
        const productionImports = collectSourceFiles(sourceRoot).flatMap((path) => {
            const relativePath = relative(appRoot, path);
            if (relativePath.includes('/app/(app)/dev/')) {
                return [];
            }
            return readFileSync(path, 'utf8').includes("@expo/vector-icons/MaterialCommunityIcons")
                ? [relativePath]
                : [];
        });

        expect(productionImports).toEqual([]);
    });
});
