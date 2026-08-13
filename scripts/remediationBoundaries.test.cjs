const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

test('five-part remediation has explicit scope and measurable exit criteria', () => {
  const document = fs.readFileSync(
    path.join(repoRoot, 'docs/governance/five-part-remediation.md'),
    'utf8',
  );

  for (const heading of [
    '核心模块边界',
    '覆盖率观测边界',
    '状态文档边界',
    '桌面产品边界',
    '历史数据模型边界',
  ]) {
    assert.match(document, new RegExp(`^## ${heading}$`, 'm'));
  }

  assert.match(document, /Claude Code 与 Codex/);
  assert.match(document, /Expo Web\/Tauri/);
  assert.match(document, /非下降门禁/);
  assert.match(document, /有数据即中止/);
  assert.doesNotMatch(document, /Gemini|OpenClaw|OpenCode|通用 ACP Provider/);
});
