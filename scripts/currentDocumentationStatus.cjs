const fs = require('node:fs');
const path = require('node:path');

const CURRENT_APP_MARKERS = ['1452'];
const CURRENT_COVERAGE_MARKERS = ['77.73', '46.02'];

function checkCurrentDocumentationText(documents) {
  const issues = [];
  for (const [document, content] of Object.entries(documents)) {
    if (!/(?:证据|Evidence\s*)218/i.test(content)) {
      issues.push({ code: 'missing-evidence-218', document });
    }
    for (const marker of CURRENT_APP_MARKERS) {
      if (!content.includes(marker)) {
        issues.push({ code: 'missing-current-app-marker', document, marker });
      }
    }
  }
  for (const document of ['projectStatus', 'validationCoverage', 'verificationMatrix']) {
    const content = documents[document] ?? '';
    if (!/(?:证据|Evidence\s*)208/i.test(content)) {
      issues.push({ code: 'missing-evidence-208', document });
    }
    for (const marker of CURRENT_COVERAGE_MARKERS) {
      if (!content.includes(marker)) {
        issues.push({ code: 'missing-current-coverage-marker', document, marker });
      }
    }
  }
  const combined = Object.values(documents).join('\n');
  if (/当前App\s*\*\*251 files\/(?:1444|1451|1453)|App统一回归为\s*\*\*251 files\/(?:1444|1451|1453)|当前观测[^\n]*(?:1444|1451|1453) tests/.test(combined)) {
    issues.push({ code: 'stale-current-app-count' });
  }
  if (/当前阶段[^\n]*专有许可证接受/.test(documents.projectStatus ?? '')) {
    issues.push({ code: 'resolved-license-blocker' });
  }
  if (/^[-*] \[ \]/m.test(documents.implementationPlan ?? '')) {
    issues.push({ code: 'unchecked-current-plan-item' });
  }
  if (/^## 唯一 ID 收口快照/m.test(documents.hardeningVerificationMatrix ?? '')) {
    issues.push({ code: 'historical-snapshot-marked-current' });
  }
  return issues;
}

function checkCurrentDocumentationStatus(repoRoot = path.resolve(__dirname, '..')) {
  return checkCurrentDocumentationText({
    projectStatus: fs.readFileSync(path.join(repoRoot, 'docs/project-status.md'), 'utf8'),
    validationCoverage: fs.readFileSync(path.join(repoRoot, 'docs/validation-coverage.md'), 'utf8'),
    verificationMatrix: fs.readFileSync(path.join(repoRoot, 'docs/verification-matrix.md'), 'utf8'),
    hardeningVerificationMatrix: fs.readFileSync(path.join(repoRoot, 'docs/audits/2026-07-11-hardening-verification-matrix.md'), 'utf8'),
    implementationPlan: fs.readFileSync(path.join(repoRoot, 'docs/superpowers/plans/2026-07-11-agenthub-hardening-and-optimization.md'), 'utf8'),
  });
}

if (require.main === module) {
  const issues = checkCurrentDocumentationStatus();
  process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, issues }, null, 2)}\n`);
  process.exitCode = issues.length === 0 ? 0 : 1;
}

module.exports = { checkCurrentDocumentationStatus, checkCurrentDocumentationText };
