#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function buildProvenance({ commit, artifacts }) {
  if (!commit || typeof commit !== 'string') throw new Error('commit is required');
  const seen = new Set();
  const normalized = artifacts.map(({ path: artifactPath, bytes }) => {
    if (!artifactPath || seen.has(artifactPath)) throw new Error(`duplicate artifact path: ${artifactPath}`);
    seen.add(artifactPath);
    const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    return { path: artifactPath, bytes: content.byteLength, sha256: crypto.createHash('sha256').update(content).digest('hex') };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return { format: 'agenthub-provenance-v1', commit, artifacts: normalized };
}

if (require.main === module) {
  const output = process.argv[2];
  const files = process.argv.slice(3);
  if (!output || files.length === 0) { console.error('usage: generateProvenance.cjs <output> <artifact...>'); process.exit(2); }
  const commit = process.env.CI_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const artifacts = files.map((file) => ({ path: file, bytes: fs.readFileSync(path.resolve(file)) }));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(buildProvenance({ commit, artifacts }), null, 2)}\n`, { mode: 0o600 });
}

module.exports = { buildProvenance };
