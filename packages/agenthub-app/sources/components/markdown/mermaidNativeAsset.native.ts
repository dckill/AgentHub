import { Asset } from 'expo-asset';
import { readAsStringAsync } from 'expo-file-system/legacy';

let scriptPromise: Promise<string> | null = null;

export function loadBundledMermaidScript(): Promise<string> {
    if (!scriptPromise) {
        scriptPromise = (async () => {
            const asset = Asset.fromModule(require('@/assets/vendor/mermaid-11.16.0.mermaidjs'));
            await asset.downloadAsync();
            const uri = asset.localUri ?? asset.uri;
            if (!uri) {
                throw new Error('Bundled Mermaid asset has no readable URI');
            }
            return readAsStringAsync(uri);
        })().catch((error) => {
            scriptPromise = null;
            throw error;
        });
    }
    return scriptPromise;
}
