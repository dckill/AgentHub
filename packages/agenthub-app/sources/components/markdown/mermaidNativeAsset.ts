import { Asset } from 'expo-asset';

let scriptPromise: Promise<string> | null = null;

export function loadBundledMermaidScript(): Promise<string> {
    if (!scriptPromise) {
        scriptPromise = (async () => {
            const asset = Asset.fromModule(require('@/assets/vendor/mermaid-11.16.0.mermaidjs'));
            const uri = asset.uri;
            if (!uri) throw new Error('Bundled Mermaid asset has no readable URI');
            const response = await fetch(uri, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Bundled Mermaid asset request failed (${response.status})`);
            return response.text();
        })().catch((error) => {
            scriptPromise = null;
            throw error;
        });
    }
    return scriptPromise;
}
