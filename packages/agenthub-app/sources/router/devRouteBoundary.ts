export type AppVariant = 'development' | 'preview' | 'production' | undefined;

export function shouldExposeDevRoutes(isDevelopment: boolean, appVariant: AppVariant): boolean {
    return isDevelopment || appVariant === 'preview';
}

export function isPreviewDevRoute(appVariant: AppVariant, segments: readonly string[]): boolean {
    if (appVariant !== 'preview') {
        return false;
    }
    const route = segments.filter((segment) => !segment.startsWith('(') && segment !== 'index');
    return route[0] === 'dev';
}
