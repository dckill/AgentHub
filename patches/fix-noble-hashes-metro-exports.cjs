const fs = require('node:fs');
const path = require('node:path');

const packageRoot = process.env.AGENTHUB_NOBLE_HASHES_PACKAGE_ROOT
  || path.dirname(require.resolve('@noble/hashes'));
const targets = [
  {
    path: path.join(packageRoot, 'esm/utils.js'),
    before: "import { crypto } from '@noble/hashes/crypto';",
    after: "import { crypto } from './crypto.js';",
  },
  {
    path: path.join(packageRoot, 'utils.js'),
    before: 'const crypto_1 = require("@noble/hashes/crypto");',
    after: 'const crypto_1 = require("./crypto.js");',
  },
];
const updates = targets.map((target) => {
  const source = fs.readFileSync(target.path, 'utf8');
  if (source.includes(target.after)) return { ...target, source, changed: false };
  if (!source.includes(target.before)) {
    throw new Error(`[postinstall] Unsupported @noble/hashes utils shape: ${target.path}`);
  }
  return { ...target, source: source.replace(target.before, target.after), changed: true };
});

if (updates.every((target) => !target.changed)) {
  console.log('[postinstall] @noble/hashes Metro exports patch already applied');
} else {
  for (const [index, target] of updates.entries()) {
    if (!target.changed) continue;
    const temporaryPath = `${target.path}.agenthub-${process.pid}-${index}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, target.source, {
        mode: fs.statSync(target.path).mode & 0o777,
      });
      fs.renameSync(temporaryPath, target.path);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
  console.log('[postinstall] Applied @noble/hashes Metro exports patch');
}
