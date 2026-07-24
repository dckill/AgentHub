const fs = require('node:fs');
const path = require('node:path');

const packageRoot = process.env.AGENTHUB_UNISTYLES_PACKAGE_ROOT
  || path.dirname(require.resolve('react-native-unistyles/package.json'));
const targets = [
  path.join(packageRoot, 'src/web/css/state.ts'),
  path.join(packageRoot, 'lib/module/web/css/state.js'),
  path.join(packageRoot, 'lib/commonjs/web/css/state.js'),
];

const incompatibleAssignment = 'this.styleTag.innerText = this.getStyles()';
const compatibleAssignment = 'this.styleTag.textContent = this.getStyles()';

for (const target of targets) {
  const source = fs.readFileSync(target, 'utf8');

  if (source.includes(compatibleAssignment)) {
    continue;
  }
  if (!source.includes(incompatibleAssignment)) {
    throw new Error(`[postinstall] Unsupported react-native-unistyles CSSState shape: ${target}`);
  }

  fs.writeFileSync(target, source.replace(incompatibleAssignment, compatibleAssignment));
}

console.log('[postinstall] Applied react-native-unistyles WebKit style-tag compatibility patch');
