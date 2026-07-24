const fs = require('node:fs');
const path = require('node:path');

const packageRoot = process.env.AGENTHUB_DRAWER_LAYOUT_PACKAGE_ROOT
  || path.dirname(require.resolve('react-native-drawer-layout/package.json'));

const targets = [
  {
    path: path.join(packageRoot, 'src/views/Overlay.tsx'),
    before: '        role="button"\n        aria-label={accessibilityLabel}',
    after: '        role="button"\n        tabIndex={open ? 0 : -1}\n        aria-label={accessibilityLabel}',
  },
  {
    path: path.join(packageRoot, 'lib/module/views/Overlay.js'),
    before: '      role: "button",\n      "aria-label": accessibilityLabel',
    after: '      role: "button",\n      tabIndex: open ? 0 : -1,\n      "aria-label": accessibilityLabel',
  },
];

for (const target of targets) {
  const source = fs.readFileSync(target.path, 'utf8');

  if (source.includes(target.after)) {
    continue;
  }
  if (!source.includes(target.before)) {
    throw new Error(`[postinstall] Unsupported react-native-drawer-layout Overlay shape: ${target.path}`);
  }

  fs.writeFileSync(target.path, source.replace(target.before, target.after));
}

console.log('[postinstall] Applied react-native-drawer-layout closed-overlay focus patch');
