import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_ROOT = join(process.cwd(), 'sources/app');
const SOURCE_ROOTS = [
    join(process.cwd(), 'sources/app'),
    join(process.cwd(), 'sources/components'),
    join(process.cwd(), 'sources/hooks'),
];

function walkFiles(root: string): string[] {
    if (!existsSync(root)) {
        return [];
    }

    const files: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(path));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            files.push(path);
        }
    }
    return files;
}

function routeFileToPath(file: string): string | null {
    const normalized = relative(APP_ROOT, file).split(sep).join('/');
    if (normalized.startsWith('+') || normalized.includes('/+')) {
        return null;
    }

    const withoutExtension = normalized.replace(/\.(ts|tsx)$/, '');
    const segments = withoutExtension
        .split('/')
        .filter(segment => segment && !segment.startsWith('_') && !/^\(.+\)$/.test(segment));

    if (segments.length === 0) {
        return null;
    }

    if (segments[segments.length - 1] === 'index') {
        segments.pop();
    }

    return `/${segments.join('/')}` || '/';
}

function routeFileToScreenName(file: string): string | null {
    const normalized = relative(APP_ROOT, file).split(sep).join('/');
    if (!normalized.startsWith('(app)/') || normalized.includes('/+')) {
        return null;
    }

    const withoutGroup = normalized.replace(/^\(app\)\//, '');
    if (withoutGroup.startsWith('_') || withoutGroup.includes('/_')) {
        return null;
    }

    return withoutGroup.replace(/\.(ts|tsx)$/, '');
}

function routePathToPattern(routePath: string): RegExp {
    const escaped = routePath
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\[.+?\\\]/g, '[^/]+');
    return new RegExp(`^${escaped}$`);
}

function stripRouteSuffix(route: string): string {
    return route.split(/[?#]/, 1)[0] || '/';
}

function templateRouteToComparablePath(route: string): string {
    return stripRouteSuffix(route).replace(/\$\{[^}]+\}/g, '__dynamic__');
}

function routerTargets(): Array<{ file: string; route: string }> {
    const targets: Array<{ file: string; route: string }> = [];
    const callPattern = /router\.(?:push|navigate|replace)\(\s*['"]([^'"]+)['"]/g;
    const templateCallPattern = /router\.(?:push|navigate|replace)\(\s*`([^`]+)`/g;
    const objectCallPattern = /router\.(?:push|navigate|replace)\(\s*\{\s*pathname:\s*['"]([^'"]+)['"]/g;

    for (const root of SOURCE_ROOTS) {
        for (const file of walkFiles(root)) {
            const source = readFileSync(file, 'utf8');
            let match: RegExpExecArray | null;
            while ((match = callPattern.exec(source)) !== null) {
                const route = stripRouteSuffix(match[1]);
                if (route.startsWith('/')) {
                    targets.push({ file: relative(process.cwd(), file), route });
                }
            }
            while ((match = templateCallPattern.exec(source)) !== null) {
                const route = templateRouteToComparablePath(match[1]);
                if (route.startsWith('/')) {
                    targets.push({ file: relative(process.cwd(), file), route });
                }
            }
            while ((match = objectCallPattern.exec(source)) !== null) {
                const route = stripRouteSuffix(match[1]);
                if (route.startsWith('/')) {
                    targets.push({ file: relative(process.cwd(), file), route });
                }
            }
        }
    }

    return targets;
}

describe('navigation routes', () => {
    it('keeps static router targets aligned with Expo Router files', () => {
        const routePatterns = walkFiles(APP_ROOT)
            .map(routeFileToPath)
            .filter((routePath): routePath is string => !!routePath)
            .map(routePathToPattern);

        const invalidTargets = routerTargets()
            .filter(target => !routePatterns.some(pattern => pattern.test(target.route)));

        expect(invalidTargets).toEqual([]);
    });

    it('keeps stack screen declarations aligned with route files', () => {
        const screenNames = new Set(
            walkFiles(APP_ROOT)
                .map(routeFileToScreenName)
                .filter((screenName): screenName is string => !!screenName)
        );
        const invalidScreens: string[] = [];
        const screenPattern = /<Stack\.Screen\s+name=["']([^"']+)["']/g;

        for (const file of walkFiles(APP_ROOT)) {
            const source = readFileSync(file, 'utf8');
            let match: RegExpExecArray | null;
            while ((match = screenPattern.exec(source)) !== null) {
                if (!screenNames.has(match[1])) {
                    invalidScreens.push(`${relative(process.cwd(), file)}:${match[1]}`);
                }
            }
        }

        expect(invalidScreens).toEqual([]);
    });
});
