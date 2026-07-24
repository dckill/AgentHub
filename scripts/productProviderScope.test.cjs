const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('product exposes only Codex and Claude Code provider entry points', () => {
  for (const path of [
    'packages/agenthub-cli/src/gemini',
    'packages/agenthub-cli/src/openclaw',
    'packages/agenthub-cli/src/agent/factories/gemini.ts',
    'packages/agenthub-cli/src/agent/transport/handlers/GeminiTransport.ts',
    'packages/agenthub-cli/src/commands/connect/authenticateGemini.ts',
  ]) {
    assert.equal(existsSync(join(root, path)), false, `${path} must not ship`);
  }

  const entry = read('packages/agenthub-cli/src/index.ts');
  assert.doesNotMatch(entry, /subcommand === ['"](?:gemini|openclaw|acp)['"]/i);
  assert.doesNotMatch(entry, /agenthub (?:gemini|openclaw|acp)\b/i);

  const rootPackage = JSON.parse(read('package.json'));
  assert.doesNotMatch(rootPackage.description, /Gemini|OpenClaw|ACP/i);
});

test('remote spawn contracts accept only Claude Code and Codex', () => {
  const expected = "z.enum(['claude', 'codex'])";
  assert.match(read('packages/agenthub-wire/src/rpc.ts'), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(read('packages/agenthub-cli/src/daemon/controlServer.ts'), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(read('packages/agenthub-agent/src/machineRpc.ts'), /SupportedAgent = 'claude' \| 'codex'/);
  assert.match(read('packages/agenthub-agent/src/index.ts'), /SUPPORTED_AGENTS[^=]*= \['claude', 'codex'\]/);
});

test('provider verification tooling contains only Claude Code and Codex', () => {
  const tools = JSON.parse(read('scripts/provider-tools/package.json'));
  assert.deepEqual(Object.keys(tools.dependencies).sort(), ['@anthropic-ai/claude-code', '@openai/codex']);
  assert.equal(existsSync(join(root, 'scripts/checkOpenClawMatrixOutput.cjs')), false);
  assert.equal(existsSync(join(root, 'scripts/checkOpenClawMatrixOutput.test.cjs')), false);
});

test('current product documentation and storefront expose only Claude Code and Codex', () => {
  for (const path of [
    'README.md',
    'docs/README.md',
    'docs/getting-started.md',
    'docs/agents-and-providers.md',
    'docs/cli.md',
    'docs/architecture.md',
    'docs/add-new-machine.md',
    'packages/agenthub-cli/README.md',
    'packages/agenthub-cli/agents.md',
    'packages/agenthub-app/Stores.md',
  ]) {
    assert.doesNotMatch(
      read(path),
      /agenthub (?:gemini|openclaw|acp)\b|connect gemini|(?:supports?|支持|启动|安装).*\b(?:Gemini|OpenClaw|OpenCode|ACP)\b/i,
      `${path} must describe the current two-provider product`,
    );
  }
});

test('app ships no dedicated removed-provider translation surface', () => {
  for (const path of [
    'packages/agenthub-app/sources/text/_default.ts',
    'packages/agenthub-app/sources/text/translations/ca.ts',
    'packages/agenthub-app/sources/text/translations/en.ts',
    'packages/agenthub-app/sources/text/translations/es.ts',
    'packages/agenthub-app/sources/text/translations/it.ts',
    'packages/agenthub-app/sources/text/translations/ja.ts',
    'packages/agenthub-app/sources/text/translations/pl.ts',
    'packages/agenthub-app/sources/text/translations/pt.ts',
    'packages/agenthub-app/sources/text/translations/ru.ts',
    'packages/agenthub-app/sources/text/translations/zh-Hans.ts',
    'packages/agenthub-app/sources/text/translations/zh-Hant.ts',
  ]) {
    assert.doesNotMatch(read(path), /^\s{4}gemini:\s*\{|^\s{8}geminiPermissionMode:\s*\{/m, `${path} must not expose Gemini-only UI copy`);
  }
});
