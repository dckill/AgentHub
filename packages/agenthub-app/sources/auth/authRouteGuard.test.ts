import { describe, expect, it } from 'vitest';
import { isPublicUnauthenticatedRoute } from './authRouteGuard';

describe('isPublicUnauthenticatedRoute', () => {
    it('allows only the login home, restore flow, and server selection', () => {
        expect(isPublicUnauthenticatedRoute(['(app)', 'index'])).toBe(true);
        expect(isPublicUnauthenticatedRoute(['(app)', 'restore', 'index'])).toBe(true);
        expect(isPublicUnauthenticatedRoute(['(app)', 'restore', 'manual'])).toBe(true);
        expect(isPublicUnauthenticatedRoute(['(app)', 'server'])).toBe(true);
    });

    it('blocks deep links into account data and developer tools', () => {
        expect(isPublicUnauthenticatedRoute(['(app)', 'session', 'secret-session'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'machine', 'secret-machine'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'settings', 'credentials'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'artifacts', 'secret-artifact'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'dev', 'logs'])).toBe(false);
    });

    it('requires authentication for opaque HTTPS session-link destinations', () => {
        expect(isPublicUnauthenticatedRoute(['(app)', 'session', 'cmrn45nnm00028a9jdjh0v1qf'])).toBe(false);
    });

    it('does not mistake similarly-prefixed routes for public routes', () => {
        expect(isPublicUnauthenticatedRoute(['(app)', 'restore-secret'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'server-admin'])).toBe(false);
    });

    it('allows only the exact opaque public share route without making sibling routes public', () => {
        expect(isPublicUnauthenticatedRoute(['(app)', 'share', '[id]'])).toBe(true);
        expect(isPublicUnauthenticatedRoute(['(app)', 'share', '00000000-0000-4000-8000-000000000001'])).toBe(true);
        expect(isPublicUnauthenticatedRoute(['(app)', 'share'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'share', '../settings'])).toBe(false);
        expect(isPublicUnauthenticatedRoute(['(app)', 'share', '00000000-0000-4000-8000-000000000001', 'edit'])).toBe(false);
    });
});
