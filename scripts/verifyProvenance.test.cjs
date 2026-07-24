const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyProvenance } = require('./verifyProvenance.cjs');

test('verifies artifact bytes against provenance', () => {
  const provenance = { format: 'agenthub-provenance-v1', commit: 'abc', artifacts: [{ path: 'a', bytes: 1, sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb' }] };
  assert.deepEqual(verifyProvenance(provenance, [{ path: 'a', bytes: Buffer.from('a') }]), { valid: true, errors: [] });
});

test('rejects tampered, missing, and unexpected artifacts', () => {
  const provenance = { format: 'agenthub-provenance-v1', commit: 'abc', artifacts: [{ path: 'a', bytes: 1, sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb' }] };
  const result = verifyProvenance(provenance, [{ path: 'a', bytes: Buffer.from('b') }, { path: 'extra', bytes: Buffer.from('x') }]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /hash mismatch/);
  assert.match(result.errors.join('\n'), /unexpected artifact/);
});
