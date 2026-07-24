#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function packageCoordinate(key) {
  const match = String(key).match(/^(.*)@([^@/][^/]*)$/);
  if (!match) return null;
  const name = match[1].startsWith('@') ? match[1] : match[1];
  return { name, version: match[2] };
}

function generateSbom(lockfilePath = path.resolve(__dirname, '..', 'pnpm-lock.yaml')) {
  const lock = YAML.parse(fs.readFileSync(lockfilePath, 'utf8'));
  const components = [];
  for (const key of Object.keys(lock.packages || {}).sort()) {
    const coordinate = packageCoordinate(key);
    if (!coordinate || !coordinate.version || coordinate.version.startsWith('link:')) continue;
    components.push({
      type: 'library',
      name: coordinate.name,
      version: coordinate.version,
      purl: `pkg:npm/${encodeURIComponent(coordinate.name).replace(/%2F/g, '/') }@${coordinate.version}`,
    });
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000000',
    version: 1,
    metadata: {
      timestamp: new Date(0).toISOString(),
      tools: [{ vendor: 'AgentHub', name: 'generateSbom', version: '1.0.0' }],
    },
    components,
  };
}

if (require.main === module) {
  const lockfileIndex = process.argv.indexOf('--lockfile');
  const lockfileArgument = lockfileIndex >= 0 ? process.argv[lockfileIndex + 1] : undefined;
  if (lockfileIndex >= 0 && (!lockfileArgument || lockfileArgument.startsWith('--'))) {
    process.stderr.write('--lockfile requires a path\n');
    process.exit(2);
  }
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  const bom = generateSbom(lockfileArgument ? path.resolve(lockfileArgument) : undefined);
  const text = `${JSON.stringify(bom, null, 2)}\n`;
  if (output) fs.writeFileSync(path.resolve(output), text, { mode: 0o600 });
  else process.stdout.write(text);
}

module.exports = { generateSbom };
