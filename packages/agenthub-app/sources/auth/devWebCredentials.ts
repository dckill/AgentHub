import type { AuthCredentials } from './tokenStorage';

type WebLocation = {
    pathname: string;
    search: string;
    hash: string;
};

export function consumeDevWebCredentials(options: {
    isDevelopment: boolean;
    platform: string;
    location: WebLocation | null;
    replaceState: (url: string) => void;
}): AuthCredentials | null {
    if (options.platform !== 'web' || !options.location) {
        return null;
    }

    const params = new URLSearchParams(options.location.search);
    const token = params.get('dev_token');
    const secret = params.get('dev_secret');
    const containedSensitiveField = params.has('dev_token') || params.has('dev_secret');

    if (containedSensitiveField) {
        params.delete('dev_token');
        params.delete('dev_secret');
        const remainingQuery = params.toString();
        options.replaceState(
            `${options.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${options.location.hash}`,
        );
    }

    if (!options.isDevelopment || !token || !secret) {
        return null;
    }

    return { token, secret };
}
