import { describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';
import { applySecurityHeaders } from './securityHeaders';

describe('applySecurityHeaders', () => {
    it('writes the minimum browser-facing hardening headers', () => {
        const header = vi.fn();
        applySecurityHeaders({ header });

        expect(header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
        expect(header).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
        expect(header).toHaveBeenCalledWith('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        expect(header).toHaveBeenCalledWith(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );
        expect(header).toHaveBeenCalledTimes(5);
    });

    it('can be attached to Fastify onSend without changing the response body', async () => {
        const app = fastify();
        app.addHook('onSend', async (_request, reply) => {
            applySecurityHeaders(reply);
        });
        app.get('/health', async () => ({ ok: true }));

        const response = await app.inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['content-security-policy']).toContain("default-src 'none'");
        await app.close();
    });
});
