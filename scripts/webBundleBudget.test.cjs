const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { measureWebBootstrap } = require('./webBundleBudget.cjs');

function createExport(scriptContents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-web-budget-'));
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  const tags = scriptContents.map((content, index) => {
    const source = `/assets/chunk-${index}.js`;
    fs.writeFileSync(path.join(root, source), content);
    return `<script src="${source}"></script>`;
  });
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>${tags.join('')}`);
  return root;
}

test('measures only scripts referenced by the exported HTML bootstrap', () => {
  const root = createExport(['const a = 1;', 'const b = 2;']);
  fs.writeFileSync(path.join(root, 'assets/deferred.js'), 'x'.repeat(100_000));

  try {
    const result = measureWebBootstrap(root, 10_000);
    assert.equal(result.scriptCount, 2);
    assert.equal(result.rawBytes, Buffer.byteLength('const a = 1;const b = 2;'));
    assert.equal(result.passed, true);
    assert.ok(result.gzipBytes > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed for a missing script or an exceeded budget', () => {
  const root = createExport(['export default "payload";']);

  try {
    assert.equal(measureWebBootstrap(root, 1).passed, false);
    fs.writeFileSync(path.join(root, 'index.html'), '<script src="/assets/missing.js"></script>');
    assert.throws(() => measureWebBootstrap(root, 10_000), /missing\.js/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
