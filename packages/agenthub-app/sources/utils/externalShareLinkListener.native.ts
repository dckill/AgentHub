import { Linking } from 'react-native';

export function subscribeExternalShareLinks(onUrl: (url: string) => void): () => void {
    let active = true;
    void Linking.getInitialURL().then((url) => {
        if (active && url) onUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
        if (active) onUrl(url);
    });
    return () => {
        active = false;
        subscription.remove();
    };
}
