const assert = require('node:assert/strict');
const test = require('node:test');
const { summarizeLicenses, evaluateLicenses, licenseListArgs } = require('./checkLicenses.cjs');

test('always inventories production dependencies when no report is supplied', () => {
  assert.deepEqual(licenseListArgs(), ['licenses', 'list', '--prod', '--json']);
});

test('summarizes license groups and accepts known SPDX identifiers', () => {
  const summary = summarizeLicenses({ MIT: [{ name: 'a', versions: ['1.0.0'] }], 'Apache-2.0': [{ name: 'b', versions: ['2.0.0'] }] });
  assert.deepEqual(summary, { packages: 2, licenses: ['Apache-2.0', 'MIT'], unknown: [], unresolvedPackages: [] });
  assert.equal(evaluateLicenses(summary), true);
});

test('rejects unknown, missing, or explicitly unlicensed packages', () => {
  const summary = summarizeLicenses({ UNKNOWN: [{ name: 'bad', versions: ['1.0.0'] }], UNLICENSED: [{ name: 'bad2', versions: ['1.0.0'] }] });
  assert.deepEqual(summary.unknown, ['UNKNOWN', 'UNLICENSED']);
  assert.equal(evaluateLicenses(summary), false);
});

test('accepts an Unknown package only with exact pinned MIT provenance', () => {
  const summary = summarizeLicenses({ Unknown: [{ name: 'khroma', versions: ['2.1.0'] }, { name: 'unreviewed', versions: ['1.0.0'] }] }, {
    packages: [{ name: 'khroma', version: '2.1.0', licenseClass: 'MIT', integrity: 'sha512-test' }],
  });
  assert.deepEqual(summary.unknown, ['Unknown']);
  assert.deepEqual(summary.unresolvedPackages, ['unreviewed@1.0.0']);
  assert.equal(evaluateLicenses(summary), false);
});

test('accepts a fully provenance-resolved Unknown license group', () => {
  const summary = summarizeLicenses({ Unknown: [{ name: 'khroma', versions: ['2.1.0'] }] }, {
    packages: [{ name: 'khroma', version: '2.1.0', licenseClass: 'MIT', integrity: 'sha512-test' }],
  });
  assert.deepEqual(summary.unknown, ['Unknown']);
  assert.deepEqual(summary.unresolvedPackages, []);
  assert.equal(evaluateLicenses(summary), true);
});
