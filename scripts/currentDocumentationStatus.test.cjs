const assert = require('node:assert/strict');
const test = require('node:test');

test('authoritative current-status documents follow the latest App aggregate evidence', () => {
  const { checkCurrentDocumentationStatus } = require('./currentDocumentationStatus.cjs');
  assert.deepEqual(checkCurrentDocumentationStatus(), []);
});

test('rejects stale current App counts and resolved license blockers', () => {
  const { checkCurrentDocumentationText } = require('./currentDocumentationStatus.cjs');
  const issues = checkCurrentDocumentationText({
    projectStatus: '当前App **251 files/1444 tests**\n当前阶段 | 专有许可证接受',
    validationCoverage: 'App统一回归为 **251 files/1444 tests**',
    verificationMatrix: 'Evidence 176 only',
  });
  assert.ok(issues.some((issue) => issue.code === 'stale-current-app-count'));
  assert.ok(issues.some((issue) => issue.code === 'resolved-license-blocker'));
  assert.ok(issues.some((issue) => issue.code === 'missing-evidence-208'));
});

test('rejects historical counts masquerading as current scope completion', () => {
  const { checkCurrentDocumentationText } = require('./currentDocumentationStatus.cjs');
  const issues = checkCurrentDocumentationText({
    projectStatus: 'Evidence 208 77.73 46.02\n当前App **251 files/1451 tests**\n当前阶段 Phase 4 本机开发完成',
    validationCoverage: 'Evidence 208 1451 77.73 46.02',
    verificationMatrix: 'Evidence 208 1451 77.73 46.02',
    hardeningVerificationMatrix: 'Evidence 208 1451 77.73 46.02\n## 唯一 ID 收口快照（2026-07-15）',
    implementationPlan: 'Evidence 208 1451 77.73 46.02\n- [ ] 有效 Gemini 与 GitLab required CI',
  });
  assert.ok(issues.some((issue) => issue.code === 'missing-evidence-218'));
  assert.ok(issues.some((issue) => issue.code === 'stale-current-app-count'));
  assert.ok(issues.some((issue) => issue.code === 'unchecked-current-plan-item'));
  assert.ok(issues.some((issue) => issue.code === 'historical-snapshot-marked-current'));
});
