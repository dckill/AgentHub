export function getParentDirectory(path: string): string | null {
    const trimmed = path.trim();
    if (!trimmed) {
        return null;
    }

    const windowsRootMatch = trimmed.match(/^[A-Za-z]:[\\/]?$/);
    if (trimmed === '/' || windowsRootMatch) {
        return null;
    }

    const separator = trimmed.includes('\\') ? '\\' : '/';
    const withoutTrailing = trimmed.replace(/[\\/]+$/, '');

    const windowsDriveMatch = withoutTrailing.match(/^([A-Za-z]:)[\\/](.*)$/);
    if (windowsDriveMatch) {
        const drive = windowsDriveMatch[1];
        const rest = windowsDriveMatch[2];
        const lastSeparator = rest.lastIndexOf(separator);
        return lastSeparator === -1
            ? `${drive}${separator}`
            : `${drive}${separator}${rest.slice(0, lastSeparator)}`;
    }

    const lastSeparator = withoutTrailing.lastIndexOf(separator);
    if (lastSeparator < 0) {
        return null;
    }
    if (lastSeparator === 0) {
        return separator;
    }

    return withoutTrailing.slice(0, lastSeparator);
}

function getRootDirectory(path: string | null | undefined): string {
    const trimmed = path?.trim() ?? '';
    const windowsDriveMatch = trimmed.match(/^([A-Za-z]:)([\\/])?/);
    if (windowsDriveMatch) {
        return `${windowsDriveMatch[1]}${windowsDriveMatch[2] ?? '\\'}`;
    }
    return '/';
}

export function getFolderBrowserRecommendedPaths(
    homeDir: string | null | undefined,
    recentPaths?: string[],
): string[] {
    void recentPaths;

    const root = getRootDirectory(homeDir);
    const paths = [root];
    const trimmedHome = homeDir?.trim();
    if (trimmedHome && trimmedHome !== root) {
        paths.push(trimmedHome.replace(/[\\/]+$/, ''));
    }

    return Array.from(new Set(paths));
}
