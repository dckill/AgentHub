const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const patchScript = path.join(repoRoot, 'patches/fix-pglite-prisma-bytes.cjs');
const supportedFixture = 'return Uint8Array.from({ length: hexString.length / 2 }, (_, index) => index);\n';
const alreadySafeFixture = [
  'function encodeBuffer(buffer) {',
  '  return Array.from(new Uint8Array(buffer));',
  '}',
  'function convertBytes(serializedBytes) {',
  '  const buffer = parsePgBytes(serializedBytes);',
  '  return encodeBuffer(buffer);',
  '}',
].join('\n');

function createFixture(source = supportedFixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-pglite-prisma-'));
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/index.mjs'), source);
  fs.writeFileSync(path.join(root, 'dist/index.cjs'), source);
  return root;
}

function runPatch(root) {
  return execFileSync(process.execPath, [patchScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, AGENTHUB_PGLITE_PRISMA_PACKAGE_ROOT: root },
  });
}

test('pglite Prisma patch converts Bytes parsing to a plain number array and is idempotent', () => {
  const root = createFixture();
  try {
    runPatch(root);
    for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
      const patched = fs.readFileSync(path.join(root, file), 'utf8');
      assert.match(patched, /Array\.from\(\{ length: hexString\.length \/ 2 \}/);
      assert.doesNotMatch(patched, /Uint8Array\.from/);
    }
    const once = fs.readFileSync(path.join(root, 'dist/index.mjs'), 'utf8');
    runPatch(root);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.mjs'), 'utf8'), once);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pglite Prisma patch accepts an adapter that already returns a plain number array', () => {
  const root = createFixture(alreadySafeFixture);
  try {
    const before = fs.readFileSync(path.join(root, 'dist/index.mjs'), 'utf8');
    assert.match(runPatch(root), /already safe/);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.mjs'), 'utf8'), before);
    assert.equal(fs.readFileSync(path.join(root, 'dist/index.cjs'), 'utf8'), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pglite Prisma patch fails closed when the dependency shape changes', () => {
  const root = createFixture('export const unsupported = true;\n');
  try {
    const result = spawnSync(process.execPath, [patchScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, AGENTHUB_PGLITE_PRISMA_PACKAGE_ROOT: root },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Unsupported pglite-prisma-adapter Bytes shape/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pglite Prisma patch breaks package-store hardlinks before writing', () => {
  const root = createFixture();
  const targets = ['dist/index.mjs', 'dist/index.cjs'].map((file) => path.join(root, file));
  const storeFiles = targets.map((target, index) => {
    const storeFile = path.join(root, `store-index-${index}.js`);
    fs.copyFileSync(target, storeFile);
    fs.unlinkSync(target);
    fs.linkSync(storeFile, target);
    return storeFile;
  });
  try {
    const originals = storeFiles.map((file) => fs.readFileSync(file, 'utf8'));
    runPatch(root);
    for (let index = 0; index < targets.length; index += 1) {
      assert.equal(fs.readFileSync(storeFiles[index], 'utf8'), originals[index]);
      assert.notEqual(fs.statSync(targets[index]).ino, fs.statSync(storeFiles[index]).ino);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
