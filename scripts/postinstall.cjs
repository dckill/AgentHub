const { execSync } = require('child_process');
const path = require('node:path');
const { createRequire } = require('node:module');

function configureIsolatedAppPatchRoots() {
  const appRoot = process.env.AGENTHUB_APP_PACKAGE_ROOT
    || path.resolve(__dirname, '..', 'packages/agenthub-app');
  const appRequire = createRequire(path.join(appRoot, 'package.json'));
  const drawerRequire = createRequire(appRequire.resolve('@react-navigation/drawer/package.json'));
  const cuidRequire = createRequire(appRequire.resolve('@paralleldrive/cuid2'));
  process.env.AGENTHUB_UNISTYLES_PACKAGE_ROOT ||= path.dirname(
    appRequire.resolve('react-native-unistyles/package.json'),
  );
  process.env.AGENTHUB_DRAWER_LAYOUT_PACKAGE_ROOT ||= path.dirname(
    drawerRequire.resolve('react-native-drawer-layout/package.json'),
  );
  process.env.AGENTHUB_NOBLE_HASHES_PACKAGE_ROOT ||= path.dirname(
    cuidRequire.resolve('@noble/hashes'),
  );
  process.env.AGENTHUB_LIBSODIUM_PACKAGE_ROOT ||= path.dirname(
    appRequire.resolve('@more-tech/react-native-libsodium/package.json'),
  );
}

// Apply patches to node_modules
require('../patches/fix-pglite-prisma-bytes.cjs');
if (process.env.SKIP_AGENTHUB_APP_PATCHES !== '1') {
  configureIsolatedAppPatchRoots();
  require('../patches/fix-livekit-room-reuse.cjs');
  require('../patches/expose-pierre-diffs-style.cjs');
  require('../patches/fix-libsodium-architectures.cjs');
  require('../patches/fix-unistyles-webkit-style-tag.cjs');
  require('../patches/fix-react-native-drawer-overlay-focus.cjs');
  require('../patches/fix-noble-hashes-metro-exports.cjs');
}

if (process.env.SKIP_AGENTHUB_WIRE_BUILD === '1') {
  console.log('[postinstall] SKIP_AGENTHUB_WIRE_BUILD=1, skipping @artsum/agenthub-wire build');
  process.exit(0);
}

execSync('pnpm --filter @artsum/agenthub-wire build', {
  stdio: 'inherit',
});
