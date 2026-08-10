import { describe, expect, it, vi } from 'vitest';
import { fetchNativeUpdateStatus } from './nativeUpdateRequestApplication';

describe('fetchNativeUpdateStatus', () => {
    it('posts the native client identity and parses an available update', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ update_required: true, update_url: ' https://example.com/app.apk ' }),
        });

        await expect(fetchNativeUpdateStatus({
            request: { signal: new AbortController().signal },
            serverUrl: 'https://agenthub.example',
            platform: 'android',
            version: '1.2.3',
            appId: 'asia.yzsd.agenthub',
            clientId: 'client-id',
            fetchImpl,
        })).resolves.toEqual({ available: true, updateUrl: 'https://example.com/app.apk' });

        expect(fetchImpl).toHaveBeenCalledWith('https://agenthub.example/v1/version', expect.objectContaining({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-AgentHub-Client': 'client-id',
            },
            body: JSON.stringify({ platform: 'android', version: '1.2.3', app_id: 'asia.yzsd.agenthub' }),
        }));
    });

    it('returns null for a non-success response without parsing a body', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: vi.fn() });
        const warn = vi.fn();

        await expect(fetchNativeUpdateStatus({
            request: { signal: new AbortController().signal },
            serverUrl: 'https://agenthub.example',
            platform: 'ios',
            version: '2.0.0',
            appId: 'asia.yzsd.agenthub.ios',
            clientId: 'client-id',
            fetchImpl,
            warn,
        })).resolves.toBeNull();

        expect(warn).toHaveBeenCalledWith('[fetchNativeUpdate] Request failed: 503');
    });
});
