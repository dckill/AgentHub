const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const tar = require('tar');
const { unpackTools } = require('../packages/agenthub-cli/scripts/unpack-tools.cjs');

async function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-unpack-tools-'));
  const toolsDir = path.join(root, 'tools');
  const archives = path.join(toolsDir, 'archives');
  const source = path.join(root, 'source');
  fs.mkdirSync(archives, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'difft'), 'difft-linux-fixture', { mode: 0o755 });
  fs.writeFileSync(path.join(source, 'rg'), 'rg-linux-fixture', { mode: 0o755 });
  fs.writeFileSync(path.join(source, 'ripgrep.node'), 'native-linux-fixture', { mode: 0o600 });
  await tar.c({ gzip: true, file: path.join(archives, 'difftastic-x64-linux.tar.gz'), cwd: source }, ['difft']);
  await tar.c({ gzip: true, file: path.join(archives, 'ripgrep-x64-linux.tar.gz'), cwd: source }, ['rg', 'ripgrep.node']);
  return { root, toolsDir };
}

test('first-use tool extraction is atomic and safe under concurrent callers', async () => {
  const fixture = await createFixture();
  try {
    const options = { toolsDir: fixture.toolsDir, platformDir: 'x64-linux', platformName: 'linux' };
    const results = await Promise.all([unpackTools(options), unpackTools(options)]);
    assert.equal(results.every((result) => result.success), true);
    assert.equal(fs.readFileSync(path.join(fixture.toolsDir, 'unpacked/.platform'), 'utf8'), 'x64-linux\n');
    assert.equal(fs.readFileSync(path.join(fixture.toolsDir, 'unpacked/difft'), 'utf8'), 'difft-linux-fixture');
    assert.equal(fs.readFileSync(path.join(fixture.toolsDir, 'unpacked/rg'), 'utf8'), 'rg-linux-fixture');
    assert.equal(fs.readFileSync(path.join(fixture.toolsDir, 'unpacked/ripgrep.node'), 'utf8'), 'native-linux-fixture');
    assert.deepEqual(
      fs.readdirSync(fixture.toolsDir).filter((entry) => entry.startsWith('.unpack-')),
      [],
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('wrong-platform or interrupted unpacked directories are replaced before use', async () => {
  const fixture = await createFixture();
  try {
    const unpacked = path.join(fixture.toolsDir, 'unpacked');
    fs.mkdirSync(unpacked, { recursive: true });
    fs.writeFileSync(path.join(unpacked, '.platform'), 'arm64-darwin\n');
    fs.writeFileSync(path.join(unpacked, 'difft'), 'wrong-platform');

    await unpackTools({ toolsDir: fixture.toolsDir, platformDir: 'x64-linux', platformName: 'linux' });

    assert.equal(fs.readFileSync(path.join(unpacked, '.platform'), 'utf8'), 'x64-linux\n');
    assert.equal(fs.readFileSync(path.join(unpacked, 'difft'), 'utf8'), 'difft-linux-fixture');
    assert.equal(fs.existsSync(path.join(unpacked, 'rg')), true);
    assert.equal(fs.existsSync(path.join(unpacked, 'ripgrep.node')), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('runtime extraction uses a versioned private user cache when package tools are only a source', async () => {
  const fixture = await createFixture();
  const previousRuntimeToolsDir = process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
  try {
    const homeDir = path.join(fixture.root, 'home');
    const result = await unpackTools({
      sourceToolsDir: fixture.toolsDir,
      cacheRootDir: homeDir,
      packageVersion: '1.2.3',
      platformDir: 'x64-linux',
      platformName: 'linux',
    });
    const expected = path.join(homeDir, 'tools', '1.2.3', 'x64-linux', 'unpacked');

    assert.equal(result.unpackedPath, expected);
    assert.equal(process.env.AGENTHUB_INTERNAL_TOOLS_DIR, expected);
    assert.equal(fs.readFileSync(path.join(expected, '.platform'), 'utf8'), 'x64-linux\n');
    assert.equal(fs.existsSync(path.join(fixture.toolsDir, 'unpacked')), false);
    assert.equal(fs.statSync(path.dirname(expected)).mode & 0o777, 0o700);
  } finally {
    if (previousRuntimeToolsDir === undefined) delete process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
    else process.env.AGENTHUB_INTERNAL_TOOLS_DIR = previousRuntimeToolsDir;
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('runtime cache rejects a symlinked private path without writing through it', async () => {
  const fixture = await createFixture();
  const previousRuntimeToolsDir = process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
  try {
    const homeDir = path.join(fixture.root, 'home');
    const outside = path.join(fixture.root, 'outside');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(homeDir, 'tools'), process.platform === 'win32' ? 'junction' : 'dir');

    await assert.rejects(
      unpackTools({
        sourceToolsDir: fixture.toolsDir,
        cacheRootDir: homeDir,
        packageVersion: '1.2.3',
        platformDir: 'x64-linux',
        platformName: 'linux',
        silent: true,
      }),
      /symbolic link/i,
    );
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    if (previousRuntimeToolsDir === undefined) delete process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
    else process.env.AGENTHUB_INTERNAL_TOOLS_DIR = previousRuntimeToolsDir;
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('runtime extraction repairs executable bits stripped by private-tree hardening', async () => {
  const fixture = await createFixture();
  try {
    const options = { toolsDir: fixture.toolsDir, platformDir: 'x64-linux', platformName: 'linux' };
    await unpackTools(options);
    fs.chmodSync(path.join(fixture.toolsDir, 'unpacked/difft'), 0o600);
    fs.chmodSync(path.join(fixture.toolsDir, 'unpacked/rg'), 0o600);

    const result = await unpackTools(options);

    assert.equal(result.alreadyUnpacked, false);
    assert.notEqual(fs.statSync(path.join(fixture.toolsDir, 'unpacked/difft')).mode & 0o100, 0);
    assert.notEqual(fs.statSync(path.join(fixture.toolsDir, 'unpacked/rg')).mode & 0o100, 0);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
