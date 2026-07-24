/**
 * Patches pglite-prisma-adapter to fix Bytes column handling.
 *
 * The adapter's parsePgBytes returns Uint8Array, which serializes as a JSON
 * object {"0":104,"1":101,...} across the JS-WASM boundary to the Prisma
 * query engine. The engine expects either a plain number[] or a base64 string.
 *
 * Fix: replace Uint8Array.from with Array.from so the result is a plain number[].
 *
 * Upstream issue: https://github.com/nicksrandall/pglite-prisma-adapter
 */
const fs = require('fs');
const path = require('path');

const explicitPackageRoot = process.env.AGENTHUB_PGLITE_PRISMA_PACKAGE_ROOT;
const repositoryRoot = path.resolve(__dirname, '..');
const packageRoots = explicitPackageRoot
    ? [path.resolve(explicitPackageRoot)]
    : [
        path.join(repositoryRoot, 'node_modules/pglite-prisma-adapter'),
        path.join(repositoryRoot, 'packages/agenthub-server/node_modules/pglite-prisma-adapter'),
    ];
const before = /Uint8Array\.from\(\s*\{\s*length:\s*hexString\.length\s*\/\s*2\s*\}/g;
const after = 'Array.from({ length: hexString.length / 2 }';
const files = packageRoots.flatMap((packageRoot) => [
    path.join(packageRoot, 'dist/index.mjs'),
    path.join(packageRoot, 'dist/index.cjs'),
]).filter((filePath, index, all) => fs.existsSync(filePath) && all.indexOf(filePath) === index);

if (explicitPackageRoot && files.length !== 2) {
    throw new Error(`[postinstall] Unsupported pglite-prisma-adapter Bytes shape: expected both dist entrypoints in ${explicitPackageRoot}`);
}

const updates = files.map((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const alreadyReturnsPlainArray = source.includes('return Array.from(new Uint8Array(buffer));')
        && source.includes('return encodeBuffer(buffer);');
    if (alreadyReturnsPlainArray) {
        return { filePath, source, changed: false, alreadySafe: true };
    }
    if (source.includes(after) && !source.includes('Uint8Array.from')) {
        return { filePath, source, changed: false, alreadySafe: false };
    }
    before.lastIndex = 0;
    if (!before.test(source)) {
        throw new Error(`[postinstall] Unsupported pglite-prisma-adapter Bytes shape: ${filePath}`);
    }
    before.lastIndex = 0;
    return { filePath, source: source.replace(before, after), changed: true, alreadySafe: false };
});

let patched = 0;
for (const [index, update] of updates.entries()) {
    if (!update.changed) continue;
    const temporaryPath = `${update.filePath}.agenthub-${process.pid}-${index}.tmp`;
    try {
        fs.writeFileSync(temporaryPath, update.source, {
            mode: fs.statSync(update.filePath).mode & 0o777,
        });
        fs.renameSync(temporaryPath, update.filePath);
        patched += 1;
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }
}

if (patched > 0) console.log(`[patch] Fixed pglite-prisma-adapter Bytes column handling (${patched} file(s))`);
else if (updates.length > 0 && updates.every((update) => update.alreadySafe)) console.log('[postinstall] pglite-prisma-adapter Bytes handling already safe');
else if (files.length > 0) console.log('[postinstall] pglite-prisma-adapter Bytes patch already applied');
