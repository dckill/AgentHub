#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcesRoot = resolve(appRoot, 'sources');
const outputDirectory = resolve(sourcesRoot, 'assets/fonts');
const subsetPath = resolve(outputDirectory, 'IoniconsSubset.ttf');
const manifestPath = resolve(outputDirectory, 'Ionicons.web.json');
const vectorIconsRoot = resolve(appRoot, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons');
const sourceFontPath = resolve(vectorIconsRoot, 'Fonts/Ionicons.ttf');
const glyphMapPath = resolve(vectorIconsRoot, 'glyphmaps/Ionicons.json');

function walkRuntimeSources(directory) {
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

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const glyphMap = JSON.parse(readFileSync(glyphMapPath, 'utf8'));
const glyphs = new Set();
const literalPattern = /(['"])([^'"\n]+)\1/g;

for (const file of walkRuntimeSources(sourcesRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(literalPattern)) {
        if (Object.hasOwn(glyphMap, match[2])) {
            glyphs.add(match[2]);
        }
    }
}

const sortedGlyphs = [...glyphs].sort();
const unicodes = [...new Set(sortedGlyphs.map((name) => glyphMap[name]))]
    .sort((left, right) => left - right)
    .map((codepoint) => `U+${codepoint.toString(16).toUpperCase()}`)
    .join(',');

mkdirSync(outputDirectory, { recursive: true });
const result = spawnSync('pyftsubset', [
    sourceFontPath,
    `--output-file=${subsetPath}`,
    `--unicodes=${unicodes}`,
    '--glyph-names',
    '--symbol-cmap',
    '--legacy-cmap',
    '--notdef-glyph',
    '--notdef-outline',
    '--recommended-glyphs',
    '--layout-features=*',
], { encoding: 'utf8' });

if (result.error?.code === 'ENOENT') {
    throw new Error('pyftsubset is required to regenerate IoniconsSubset.ttf (install fonttools in an isolated tool environment)');
}
if (result.status !== 0) {
    throw new Error(result.stderr || `pyftsubset failed with exit code ${result.status}`);
}

writeFileSync(manifestPath, `${JSON.stringify({
    generatedBy: 'packages/agenthub-app/scripts/generate-ionicons-web-subset.mjs',
    glyphCount: sortedGlyphs.length,
    glyphs: sortedGlyphs,
    sourceFontSha256: sha256(sourceFontPath),
    subsetFontSha256: sha256(subsetPath),
}, null, 2)}\n`);

console.log(`Generated ${subsetPath} with ${sortedGlyphs.length} runtime glyph names`);
