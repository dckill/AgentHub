const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const serverRoot = path.join(repoRoot, 'packages/agenthub-server');
const runtimeDirectory = path.join(serverRoot, 'dist/runtime');

test('Server runtime build emits Node 20 ESM entrypoints without source aliases', () => {
  fs.rmSync(runtimeDirectory, { recursive: true, force: true });

  const result = spawnSync(
    process.execPath,
    [path.join(serverRoot, 'scripts/buildRuntime.mjs')],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const entrypoint of ['main.mjs', 'standalone.mjs']) {
    const outputPath = path.join(runtimeDirectory, entrypoint);
    const output = fs.readFileSync(outputPath, 'utf8');
    assert.ok(output.length > 1_000, `${entrypoint} must contain a compiled runtime`);
    assert.doesNotMatch(output, /(?:from|import\()\s*["']@\//, `${entrypoint} contains an unresolved source alias`);
    assert.doesNotMatch(
      output,
      /(?:from|import\()\s*["'][^"']+\.ts["']/,
      `${entrypoint} imports a TypeScript source entrypoint`,
    );
    assert.match(
      output,
      /from ["']@artsum\/agenthub-wire["']/,
      `${entrypoint} must preserve the Wire package ownership boundary`,
    );

    const syntax = spawnSync(process.execPath, ['--check', outputPath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, `${syntax.stdout}\n${syntax.stderr}`);
  }
});
