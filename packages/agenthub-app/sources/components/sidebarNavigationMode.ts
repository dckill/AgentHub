export function getSidebarNavigationMode(isAuthenticated: boolean, platform: string): 'slot' | 'drawer' {
    if (platform === 'web' && !isAuthenticated) {
        return 'slot';
    }
    return 'drawer';
}
