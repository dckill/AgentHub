const assert = require('node:assert/strict');
const test = require('node:test');
const { buildProvenance } = require('./generateProvenance.cjs');

test('builds deterministic sha256 provenance for sorted artifacts', () => {
  const result = buildProvenance({ commit: 'abc123', artifacts: [
    { path: 'z.json', bytes: Buffer.from('z') },
    { path: 'a.json', bytes: Buffer.from('a') },
  ] });
  assert.deepEqual(result, {
    format: 'agenthub-provenance-v1',
    commit: 'abc123',
    artifacts: [
      { path: 'a.json', bytes: 1, sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb' },
      { path: 'z.json', bytes: 1, sha256: '594e519ae499312b29433b7dd8a97ff068defcba9755b6d5d00e84c524d67b06' },
    ],
  });
});

test('rejects missing commit or duplicate artifact paths', () => {
  assert.throws(() => buildProvenance({ artifacts: [] }), /commit/);
  assert.throws(() => buildProvenance({ commit: 'x', artifacts: [{ path: 'a', bytes: Buffer.from('a') }, { path: 'a', bytes: Buffer.from('b') }] }), /duplicate/);
});
