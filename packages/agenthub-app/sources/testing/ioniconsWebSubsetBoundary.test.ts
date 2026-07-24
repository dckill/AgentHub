import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');
const sourcesRoot = resolve(appRoot, 'sources');
const subsetPath = resolve(sourcesRoot, 'assets/fonts/IoniconsSubset.ttf');
const manifestPath = resolve(sourcesRoot, 'assets/fonts/Ionicons.web.json');
const vectorIconsRoot = resolve(appRoot, 'node_modules/@expo/vector-icons');
const originalPath = resolve(vectorIconsRoot, 'build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf');
const glyphMapPath = resolve(vectorIconsRoot, 'build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');

function walkRuntimeSources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return walkRuntimeSources(path);
        }
        if (!['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name))) {
            return [];
        }
        if (/\.(?:test|spec)\.[jt]sx?$/.test(entry.name)) {
            return [];
        }
        return [path];
    });
}

function sha256(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('Ionicons Web font subset boundary', () => {
    it('routes only Web builds to the checked-in subset while native keeps the upstream font', () => {
        const metroConfig = readFileSync(resolve(appRoot, 'metro.config.js'), 'utf8');

        expect(metroConfig).toContain("platform === 'web'");
        expect(metroConfig).toContain("vendor/react-native-vector-icons/Fonts/Ionicons.ttf");
        expect(metroConfig).toContain("sources/assets/fonts/IoniconsSubset.ttf");
    });

    it('covers every literal runtime Ionicons glyph and is materially smaller than upstream', () => {
        expect(existsSync(subsetPath)).toBe(true);
        expect(existsSync(manifestPath)).toBe(true);

        const glyphMap = JSON.parse(readFileSync(glyphMapPath, 'utf8')) as Record<string, number>;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            glyphs: string[];
            sourceFontSha256: string;
            subsetFontSha256: string;
        };
        const runtimeGlyphs = new Set<string>();
        const literalPattern = /(['"])([^'"\n]+)\1/g;

        for (const file of walkRuntimeSources(sourcesRoot)) {
            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(literalPattern)) {
                if (Object.hasOwn(glyphMap, match[2])) {
                    runtimeGlyphs.add(match[2]);
                }
            }
        }

        expect(manifest.glyphs).toEqual([...runtimeGlyphs].sort());
        expect(manifest.sourceFontSha256).toBe(sha256(originalPath));
        expect(manifest.subsetFontSha256).toBe(sha256(subsetPath));
        expect(statSync(subsetPath).size).toBeLessThan(statSync(originalPath).size / 2);
        expect(relative(appRoot, subsetPath)).toBe('sources/assets/fonts/IoniconsSubset.ttf');
    });
});
