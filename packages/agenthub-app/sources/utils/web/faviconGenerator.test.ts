import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetFavicon, updateFaviconWithNotification } from './faviconGenerator';

function installDocument(initialHref?: string) {
    const assignments: string[] = [];
    let href = initialHref ?? '';
    const link = {
        rel: '',
        type: '',
        get href() {
            return href;
        },
        set href(value: string) {
            href = value;
            assignments.push(value);
        },
    };
    const appendChild = vi.fn();
    const document = {
        baseURI: 'https://agenthub.example/',
        createElement: vi.fn(() => link),
        head: { appendChild },
        querySelector: vi.fn(() => initialHref === undefined ? null : link),
    };
    vi.stubGlobal('document', document);
    return { appendChild, assignments, document, link };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Web favicon switching', () => {
    it('does not reload the normal favicon when the document already targets it', () => {
        const fixture = installDocument('https://agenthub.example/favicon.ico');

        resetFavicon();

        expect(fixture.assignments).toEqual([]);
        expect(fixture.document.createElement).not.toHaveBeenCalled();
    });

    it('changes to the active favicon once and reuses the browser cache on repeated state', () => {
        const fixture = installDocument('https://agenthub.example/favicon.ico');

        updateFaviconWithNotification();
        updateFaviconWithNotification();

        expect(fixture.assignments).toEqual(['/favicon-active.ico']);
        expect(fixture.assignments[0]).not.toContain('?t=');
    });

    it('creates a favicon link only when the document has none', () => {
        const fixture = installDocument();

        resetFavicon();

        expect(fixture.link.rel).toBe('icon');
        expect(fixture.link.type).toBe('image/x-icon');
        expect(fixture.appendChild).toHaveBeenCalledWith(fixture.link);
        expect(fixture.assignments).toEqual(['/favicon.ico']);
    });
});
