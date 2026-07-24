import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { getProductionRouteFiles, shouldUseProductionRouterContext } from './productionRouterBoundary';
import { isPreviewDevRoute, shouldExposeDevRoutes } from './devRouteBoundary';

const appRoot = resolve(__dirname, '../app');

describe('production Router boundary', () => {
    it('includes developer routes in development and preview, but never production', () => {
        expect(shouldUseProductionRouterContext('development')).toBe(false);
        expect(shouldUseProductionRouterContext('preview')).toBe(false);
        expect(shouldUseProductionRouterContext('production')).toBe(true);
        expect(shouldUseProductionRouterContext(undefined)).toBe(true);

        expect(shouldExposeDevRoutes(true, 'development')).toBe(true);
        expect(shouldExposeDevRoutes(false, 'preview')).toBe(true);
        expect(shouldExposeDevRoutes(false, 'production')).toBe(false);
        expect(shouldExposeDevRoutes(false, undefined)).toBe(false);
    });

    it('allows unauthenticated dev routes only in preview builds', () => {
        expect(isPreviewDevRoute('preview', ['(app)', 'dev', 'modal-demo'])).toBe(true);
        expect(isPreviewDevRoute('production', ['(app)', 'dev', 'modal-demo'])).toBe(false);
        expect(isPreviewDevRoute('preview', ['(app)', 'session', 'secret-session'])).toBe(false);
    });

    it('excludes every dev route while preserving product routes', () => {
        const routes = getProductionRouteFiles(appRoot);
        expect(routes.some((route) => route.includes('/dev/'))).toBe(false);
        expect(routes).toContain('./(app)/session/[id].tsx');
        expect(routes).toContain('./_layout.tsx');
    });

    it('wires the production-only context into Metro resolution', () => {
        const metroConfig = readFileSync(resolve(appRoot, '../../metro.config.js'), 'utf8');
        const productionContext = readFileSync(resolve(__dirname, 'productionRouterContext.js'), 'utf8');

        expect(metroConfig).toContain("moduleName === 'expo-router/_ctx'");
        expect(metroConfig).toContain('shouldUseProductionRouterContext(process.env.APP_ENV)');
        expect(productionContext).toMatch(/require\.context\(\s*['"]\.\.\/app['"]/);
        expect(productionContext).toContain('(?!.*\\/dev\\/)');
    });

    it('does not register excluded dev screens in production layouts', () => {
        const appLayout = readFileSync(resolve(appRoot, '(app)/_layout.tsx'), 'utf8');
        expect(appLayout).toContain('{exposeDevRoutes && <DevRouteScreens />}');
        expect(appLayout).toContain('process.env.EXPO_PUBLIC_AGENTHUB_APP_VARIANT');
        expect(appLayout).toContain("const exposeDevRoutes = __DEV__ || process.env.EXPO_PUBLIC_AGENTHUB_APP_VARIANT === 'preview';");
        expect(appLayout).toContain('isPreviewDevRoute(appVariant, segments)');
    });

    it('defers storage-dependent console setup until the root layout mounts', () => {
        const rootLayout = readFileSync(resolve(appRoot, '_layout.tsx'), 'utf8');
        const rootComponentOffset = rootLayout.indexOf('export default function RootLayout()');

        expect(rootComponentOffset).toBeGreaterThan(0);
        expect(rootLayout.slice(0, rootComponentOffset)).not.toMatch(/\binitConsoleLogging\(\)/);
        expect(rootLayout.slice(rootComponentOffset)).toMatch(/React\.useEffect\(\(\) => \{[\s\S]*?initConsoleLogging\(\)/);
    });
});
