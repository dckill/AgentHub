/**
 * Simple utility for switching between normal and active favicons
 */

const FAVICON_NORMAL = '/favicon.ico';
const FAVICON_ACTIVE = '/favicon-active.ico';

/**
 * Updates the favicon in the document
 */
function setFavicon(url: string) {
    if (typeof document === 'undefined') return;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/x-icon';
        document.head.appendChild(link);
    }

    const baseUri = document.baseURI || undefined;
    try {
        if (new URL(link.href, baseUri).href === new URL(url, baseUri).href) return;
    } catch {
        // A malformed pre-existing href is replaced by the known local asset below.
    }
    link.href = url;
}

/**
 * Updates the favicon to show a notification indicator
 */
export function updateFaviconWithNotification() {
    setFavicon(FAVICON_ACTIVE);
}

/**
 * Resets the favicon to its original state
 */
export function resetFavicon() {
    setFavicon(FAVICON_NORMAL);
}
