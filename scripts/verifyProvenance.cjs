#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function verifyProvenance(provenance, artifacts) {
  const expected = new Map((provenance?.artifacts || []).map((entry) => [entry.path, entry]));
  const seen = new Set();
  const errors = [];
  for (const artifact of artifacts) {
    const entry = expected.get(artifact.path);
    if (!entry) { errors.push(`unexpected artifact: ${artifact.path}`); continue; }
    seen.add(artifact.path);
    const bytes = Buffer.isBuffer(artifact.bytes) ? artifact.bytes : Buffer.from(artifact.bytes);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== entry.bytes) errors.push(`byte count mismatch: ${artifact.path}`);
    if (hash !== entry.sha256) errors.push(`hash mismatch: ${artifact.path}`);
  }
  for (const artifactPath of expected.keys()) if (!seen.has(artifactPath)) errors.push(`missing artifact: ${artifactPath}`);
  return { valid: errors.length === 0, errors };
}

if (require.main === module) {
  const provenancePath = process.argv[2];
  if (!provenancePath) { console.error('usage: verifyProvenance.cjs <provenance.json>'); process.exit(2); }
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  const artifacts = provenance.artifacts.map((entry) => ({ path: entry.path, bytes: fs.readFileSync(path.resolve(entry.path)) }));
  const result = verifyProvenance(provenance, artifacts);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.valid ? 0 : 1;
}

module.exports = { verifyProvenance };
