const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('root CI exposes a browser-free Web contract gate', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    assert.equal(
        pkg.scripts['web:contract:test'],
        'node --test scripts/webContractCI.test.cjs && pnpm --filter agenthub-app exec vitest run sources/auth/tokenStorage.test.ts sources/auth/authRouteGuard.test.ts sources/auth/accountRuntime.test.ts sources/router/productionRouterBoundary.test.ts sources/testing/rootInitialization.test.ts sources/testing/corePageAccessibilityBoundary.test.ts sources/testing/settingsSubpageAccessibilityBoundary.test.ts sources/testing/sessionWorkbenchAccessibilityBoundary.test.ts sources/testing/appLinksSecurityPolicy.test.ts sources/testing/webPlatformPayloadBoundary.test.ts',
    );
    assert.equal(pkg.scripts['web:e2e'], undefined);
    assert.equal(pkg.scripts['web:e2e:test'], undefined);
    assert.equal(pkg.devDependencies.playwright, undefined);
    assert.match(pkg.scripts['ci:verify'], /pnpm web:contract:test/);
    assert.doesNotMatch(pkg.scripts['ci:verify'], /web:e2e/);
});

test('GitLab requires the Web contract job and retains JUnit without a browser image', () => {
    const ci = fs.readFileSync(path.join(root, '.gitlab-ci.yml'), 'utf8');

    assert.match(ci, /^web:contract:\n  extends: \.required$/m);
    assert.match(ci, /pnpm web:contract:test --reporter=default --reporter=junit --outputFile\.junit=\.\.\/\.\.\/reports\/web-contract\/junit\.xml/);
    assert.match(ci, /junit:\n\s+- reports\/web-contract\/junit\.xml/);
    assert.doesNotMatch(ci, /^web:e2e:/m);
    assert.doesNotMatch(ci, /mcr\.microsoft\.com\/playwright|PLAYWRIGHT_BROWSERS_PATH|authenticated-web\.xml/);
});

test('browser runner files are removed from the required CI surface', () => {
    assert.equal(fs.existsSync(path.join(root, 'scripts/runAuthenticatedWebE2E.cjs')), false);
    assert.equal(fs.existsSync(path.join(root, 'scripts/authenticatedWebE2E.test.cjs')), false);
});
