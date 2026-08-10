import * as React from 'react';
import { decryptBlob } from '@/encryption/blob';
import { encodeBase64 } from '@/encryption/base64';
import { downloadEncryptedAttachment } from '@/sync/apiAttachments';
import { sync } from '@/sync/sync';
import { detectAttachmentImageMime } from './attachmentImageMime';

const MAX_CACHE_ENTRIES = 20;
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function remember(key: string, value: string) {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

async function loadAttachment(sessionId: string, ref: string, generation: number): Promise<string | null> {
    if (sync.getAccountGeneration() !== generation) return null;
    const credentials = sync.getCredentials();
    let blobKey: Uint8Array | null;
    try {
        blobKey = sync.encryption.getSessionBlobKey(sessionId);
    } catch {
        return null;
    }
    if (!credentials || !blobKey) return null;
    const encrypted = await downloadEncryptedAttachment(credentials, sessionId, ref);
    if (sync.getAccountGeneration() !== generation) return null;
    const bytes = decryptBlob(encrypted, blobKey);
    if (!bytes) return null;
    const mimeType = detectAttachmentImageMime(bytes);
    if (!mimeType) return null;
    return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

export function useAttachmentImage(sessionId: string, ref: string | undefined) {
    const generation = sync.getAccountGeneration();
    const key = ref && generation !== null ? `${generation}:${sessionId}:${ref}` : '';
    const [state, setState] = React.useState<{ uri: string | null; loading: boolean; error: boolean }>(() => ({
        uri: key ? cache.get(key) ?? null : null,
        loading: Boolean(key && !cache.has(key)),
        error: false,
    }));

    React.useEffect(() => {
        if (!ref || generation === null) {
            setState({ uri: null, loading: false, error: false });
            return;
        }
        const cached = cache.get(key);
        if (cached) {
            setState({ uri: cached, loading: false, error: false });
            return;
        }
        let cancelled = false;
        setState({ uri: null, loading: true, error: false });
        let promise = inFlight.get(key);
        if (!promise) {
            promise = loadAttachment(sessionId, ref, generation).finally(() => inFlight.delete(key));
            inFlight.set(key, promise);
        }
        promise.then((uri) => {
            if (cancelled || sync.getAccountGeneration() !== generation) return;
            if (uri) remember(key, uri);
            setState({ uri, loading: false, error: !uri });
        }).catch(() => {
            if (!cancelled && sync.getAccountGeneration() === generation) setState({ uri: null, loading: false, error: true });
        });
        return () => { cancelled = true; };
    }, [generation, key, ref, sessionId]);

    return state;
}
