#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const SPDX = new Set([
  '0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MIT', 'MPL-2.0',
  'OFL-1.1', 'Python-2.0', 'Unlicense', 'Unicode-DFS-2016', 'Zlib', 'CC0-1.0',
  'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'LGPL-3.0-or-later', 'AGPL-3.0', 'WTFPL', 'AFL-2.1',
  'BlueOak-1.0.0', 'CC-BY-4.0', 'Public Domain',
]);

function normalizeLicense(value) {
  return String(value).trim().replace(/Apache 2(?:\.0)?/g, 'Apache-2.0').replace(/^apache-2\.0$/i, 'Apache-2.0');
}

function summarizeLicenses(report, provenance = {}) {
  const groups = report && typeof report === 'object' ? report : {};
  const licenses = Object.keys(groups).map(normalizeLicense).sort();
  const packages = licenses.reduce((count, license) => count + (Array.isArray(groups[license]) ? groups[license].length : 0), 0);
  const unknown = licenses.filter((license) => {
    if (SPDX.has(license)) return false;
    const expressionParts = license.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/);
    return expressionParts.some((part) => !SPDX.has(part));
  });
  const provenanceByCoordinate = new Map((provenance.packages || []).map((entry) => [`${entry.name}@${entry.version}`, entry]));
  const unresolvedPackages = [];
  for (const license of licenses) {
    if (!unknown.includes(license)) continue;
    for (const entry of groups[license] || []) {
      for (const version of entry.versions || []) {
        const coordinate = `${entry.name}@${version}`;
        const evidence = provenanceByCoordinate.get(coordinate);
        if (!evidence || !SPDX.has(evidence.licenseClass) || !evidence.integrity) unresolvedPackages.push(coordinate);
      }
    }
  }
  return { packages, licenses, unknown, unresolvedPackages: [...new Set(unresolvedPackages)].sort() };
}

function evaluateLicenses(summary) {
  return summary.unresolvedPackages.length === 0;
}

function licenseListArgs() {
  return ['licenses', 'list', '--prod', '--json'];
}

if (require.main === module) {
  const output = process.argv[2];
  const provenancePath = process.argv[3] || 'docs/audits/evidence/2026-07-12-supply-chain/license-provenance.json';
  const provenance = fs.existsSync(provenancePath) ? JSON.parse(fs.readFileSync(provenancePath, 'utf8')) : {};
  let result = output ? { stdout: fs.readFileSync(output, 'utf8') } : spawnSync(process.env.PNPM_BIN || 'pnpm', licenseListArgs(), { encoding: 'utf8' });
  if (!output && result.error?.code === 'ENOENT') {
    result = spawnSync('npx', ['-y', 'pnpm@10.11.0', ...licenseListArgs()], { encoding: 'utf8' });
  }
  const report = JSON.parse(result.stdout);
  const summary = summarizeLicenses(report, provenance);
  console.log(JSON.stringify({ ...summary, passed: evaluateLicenses(summary) }, null, 2));
  process.exitCode = evaluateLicenses(summary) && summary.unresolvedPackages.length === 0 ? 0 : 1;
}

module.exports = { summarizeLicenses, evaluateLicenses, licenseListArgs };
