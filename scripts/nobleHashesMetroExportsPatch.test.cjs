const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const patchScript = path.join(repoRoot, 'patches/fix-noble-hashes-metro-exports.cjs');

const supportedFixture = "import { crypto } from '@noble/hashes/crypto';\nexport const randomBytes = () => crypto.getRandomValues(new Uint8Array(32));\n";
const supportedCommonJsFixture = "const crypto_1 = require(\"@noble/hashes/crypto\");\nexports.randomBytes = () => crypto_1.crypto.getRandomValues(new Uint8Array(32));\n";

function createFixture(source = supportedFixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-noble-hashes-'));
  fs.mkdirSync(path.join(root, 'esm'), { recursive: true });
  fs.writeFileSync(path.join(root, 'esm/utils.js'), source);
  fs.writeFileSync(path.join(root, 'utils.js'), supportedCommonJsFixture);
  return root;
}

function runPatch(root) {
  return execFileSync(process.execPath, [patchScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENTHUB_NOBLE_HASHES_PACKAGE_ROOT: root,
    },
  });
}

test('noble hashes patch uses the exported relative crypto module for Metro', () => {
  const root = createFixture();
  try {
    runPatch(root);
    const patched = fs.readFileSync(path.join(root, 'esm/utils.js'), 'utf8');
    const patchedCommonJs = fs.readFileSync(path.join(root, 'utils.js'), 'utf8');
    assert.match(patched, /from '\.\/crypto\.js'/);
    assert.doesNotMatch(patched, /from '@noble\/hashes\/crypto'/);
    assert.match(patchedCommonJs, /require\(\"\.\/crypto\.js\"\)/);
    assert.doesNotMatch(patchedCommonJs, /require\(\"@noble\/hashes\/crypto\"\)/);

    runPatch(root);
    assert.equal(fs.readFileSync(path.join(root, 'esm/utils.js'), 'utf8'), patched);
    assert.equal(fs.readFileSync(path.join(root, 'utils.js'), 'utf8'), patchedCommonJs);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('noble hashes patch fails closed when the dependency shape changes', () => {
  const root = createFixture('export const unsupported = true;\n');
  try {
    const result = spawnSync(process.execPath, [patchScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        AGENTHUB_NOBLE_HASHES_PACKAGE_ROOT: root,
      },
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Unsupported @noble\/hashes utils shape/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('noble hashes patch breaks package-store hardlinks before writing', () => {
  const root = createFixture();
  const targets = [path.join(root, 'esm/utils.js'), path.join(root, 'utils.js')];
  const storeFiles = targets.map((target, index) => {
    const storeFile = path.join(root, `store-utils-${index}.js`);
    fs.copyFileSync(target, storeFile);
    fs.unlinkSync(target);
    fs.linkSync(storeFile, target);
    return storeFile;
  });

  try {
    const originals = storeFiles.map((storeFile) => fs.readFileSync(storeFile, 'utf8'));
    runPatch(root);

    for (let index = 0; index < targets.length; index += 1) {
      assert.equal(fs.readFileSync(storeFiles[index], 'utf8'), originals[index]);
      assert.notEqual(fs.statSync(targets[index]).ino, fs.statSync(storeFiles[index]).ino);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
