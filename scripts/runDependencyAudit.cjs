#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { summarizeAudit, evaluateThreshold } = require('./checkDependencyAudit.cjs');

const output = path.resolve(process.argv[2] || 'reports/security/pnpm-audit.json');
const threshold = process.argv[3] || 'high';
fs.mkdirSync(path.dirname(output), { recursive: true });
const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8' });
fs.writeFileSync(output, result.stdout || '', { mode: 0o600 });
if (result.error) throw result.error;
const summary = summarizeAudit(JSON.parse(result.stdout));
const passed = evaluateThreshold(summary, threshold);
console.log(JSON.stringify({ ...summary, threshold, auditExitCode: result.status, passed, report: output }, null, 2));
process.exitCode = passed ? 0 : 1;
