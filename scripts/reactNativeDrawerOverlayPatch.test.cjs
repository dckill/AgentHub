const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const patchScript = path.join(repoRoot, 'patches/fix-react-native-drawer-overlay-focus.cjs');

const sourceFixture = `import { Pressable } from 'react-native';
export function Overlay({ open, accessibilityLabel }) {
  return (
      <Pressable
        role="button"
        aria-label={accessibilityLabel}
      />
  );
}
`;

const moduleFixture = `export function Overlay({ open, accessibilityLabel }) {
  return _jsx(Pressable, {
      role: "button",
      "aria-label": accessibilityLabel
  });
}
`;

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-drawer-overlay-'));
  fs.mkdirSync(path.join(root, 'src/views'), { recursive: true });
  fs.mkdirSync(path.join(root, 'lib/module/views'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/views/Overlay.tsx'), sourceFixture);
  fs.writeFileSync(path.join(root, 'lib/module/views/Overlay.js'), moduleFixture);
  return root;
}

function runPatch(root) {
  return execFileSync(process.execPath, [patchScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENTHUB_DRAWER_LAYOUT_PACKAGE_ROOT: root,
    },
  });
}

test('drawer overlay patch removes the closed Web overlay from sequential focus', () => {
  const root = createFixture();
  try {
    runPatch(root);
    const source = fs.readFileSync(path.join(root, 'src/views/Overlay.tsx'), 'utf8');
    const compiled = fs.readFileSync(path.join(root, 'lib/module/views/Overlay.js'), 'utf8');

    assert.match(source, /tabIndex=\{open \? 0 : -1\}/);
    assert.match(compiled, /tabIndex: open \? 0 : -1/);
    assert.equal((source.match(/tabIndex=/g) || []).length, 1);
    assert.equal((compiled.match(/tabIndex:/g) || []).length, 1);

    runPatch(root);
    assert.equal(fs.readFileSync(path.join(root, 'src/views/Overlay.tsx'), 'utf8'), source);
    assert.equal(fs.readFileSync(path.join(root, 'lib/module/views/Overlay.js'), 'utf8'), compiled);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('drawer overlay patch fails closed when the dependency shape changes', () => {
  const root = createFixture();
  try {
    fs.writeFileSync(path.join(root, 'src/views/Overlay.tsx'), 'unsupported source');
    const result = spawnSync(process.execPath, [patchScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        AGENTHUB_DRAWER_LAYOUT_PACKAGE_ROOT: root,
      },
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Unsupported react-native-drawer-layout Overlay shape/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
