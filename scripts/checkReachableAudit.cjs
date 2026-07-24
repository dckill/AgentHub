#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const SEVERITIES = new Set(['high', 'critical']);

function summarizeReachability(report) {
  if (!report || typeof report.advisories !== 'object') throw new Error('audit report advisories is required');
  const result = { high: [], critical: [] };
  for (const [id, advisory] of Object.entries(report.advisories)) {
    if (!SEVERITIES.has(advisory?.severity)) continue;
    const paths = (advisory.findings || []).flatMap((finding) => Array.isArray(finding.paths) ? finding.paths : []);
    result[advisory.severity].push({ id: String(id), module: advisory.module_name || 'unknown', paths: [...new Set(paths)].sort() });
  }
  result.high.sort((a, b) => a.id.localeCompare(b.id));
  result.critical.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

function evaluateReachability(summary) {
  return summary.high.length === 0 && summary.critical.length === 0;
}

function writeReachabilityReport(output, report) {
  const resolved = path.resolve(output);
  const directory = path.dirname(resolved);
  const temporary = path.join(directory, `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, resolved);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

if (require.main === module) {
  const input = process.argv[2];
  if (!input) { console.error('usage: checkReachableAudit.cjs <pnpm-audit.json> [--output <report.json>]'); process.exit(2); }
  const summary = summarizeReachability(JSON.parse(fs.readFileSync(input, 'utf8')));
  const report = { ...summary, passed: evaluateReachability(summary) };
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !output) { console.error('--output requires a path'); process.exit(2); }
  if (output) writeReachabilityReport(output, report);
  else console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}

module.exports = { summarizeReachability, evaluateReachability, writeReachabilityReport };
