#!/usr/bin/env node
const fs = require('node:fs');

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

function summarizeAudit(report) {
  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    throw new Error('audit report metadata.vulnerabilities is required');
  }
  const normalized = Object.fromEntries(SEVERITIES.map((severity) => [severity, Number(vulnerabilities[severity] || 0)]));
  if (Object.values(normalized).some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('audit vulnerability counts must be non-negative integers');
  }
  return {
    dependencies: Number(report.metadata.dependencies || report.metadata.totalDependencies || 0),
    vulnerabilities: normalized,
  };
}

function evaluateThreshold(summary, threshold = 'high') {
  const index = SEVERITIES.indexOf(threshold);
  if (index < 0) throw new Error(`unsupported threshold: ${threshold}`);
  return SEVERITIES.slice(index).every((severity) => summary.vulnerabilities[severity] === 0);
}

if (require.main === module) {
  const input = process.argv[2];
  const threshold = process.argv[3] || 'high';
  if (!input) {
    console.error('usage: checkDependencyAudit.cjs <pnpm-audit.json> [threshold]');
    process.exit(2);
  }
  const summary = summarizeAudit(JSON.parse(fs.readFileSync(input, 'utf8')));
  console.log(JSON.stringify({ ...summary, threshold, passed: evaluateThreshold(summary, threshold) }, null, 2));
  process.exitCode = evaluateThreshold(summary, threshold) ? 0 : 1;
}

module.exports = { summarizeAudit, evaluateThreshold };
