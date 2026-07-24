const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateSbom } = require('./generateSbom.cjs');

const lockfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-sbom-')), 'pnpm-lock.yaml');
fs.writeFileSync(lockfile, 'lockfileVersion: "9.0"\npackages:\n  lodash@4.17.21: {}\n  "@scope/pkg@1.2.3": {}\n');
const bom = generateSbom(lockfile);
const secondBom = generateSbom(lockfile);
assert.equal(bom.bomFormat, 'CycloneDX');
assert.equal(bom.specVersion, '1.5');
assert.deepEqual(bom.components.map((component) => component.purl), ['pkg:npm/%40scope/pkg@1.2.3', 'pkg:npm/lodash@4.17.21']);
assert.deepEqual(secondBom, bom);
assert.equal(new Set(bom.components.map((component) => component.purl)).size, bom.components.length);

const output = path.join(path.dirname(lockfile), 'provider-tools.cdx.json');
const cli = spawnSync(process.execPath, [path.join(__dirname, 'generateSbom.cjs'), '--lockfile', lockfile, '--output', output], {
  encoding: 'utf8',
});
assert.equal(cli.status, 0, cli.stderr);
assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), bom);

const missingLockfileValue = spawnSync(process.execPath, [path.join(__dirname, 'generateSbom.cjs'), '--lockfile'], {
  encoding: 'utf8',
});
assert.equal(missingLockfileValue.status, 2);
assert.match(missingLockfileValue.stderr, /--lockfile requires a path/);
console.log(`SBOM fixture PASS (${bom.components.length} components)`);
