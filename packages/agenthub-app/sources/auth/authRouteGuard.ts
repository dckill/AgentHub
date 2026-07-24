const PUBLIC_UNAUTHENTICATED_ROOTS = new Set(['restore', 'server']);
const PUBLIC_SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublicUnauthenticatedRoute(segments: readonly string[]): boolean {
    const route = segments.filter(segment => !segment.startsWith('(') && segment !== 'index');
    if (route.length === 0) {
        return true;
    }
    if (route[0] === 'restore') {
        return route.length === 1 || (route.length === 2 && route[1] === 'manual');
    }
    if (route[0] === 'share') {
        return route.length === 2 && (route[1] === '[id]' || PUBLIC_SHARE_ID.test(route[1]));
    }
    return route.length === 1 && PUBLIC_UNAUTHENTICATED_ROOTS.has(route[0]);
}
