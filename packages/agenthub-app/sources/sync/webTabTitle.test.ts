import { describe, expect, it, vi } from 'vitest';
import { createWebTabTitleController } from './webTabTitle';

function createBrowserFixture() {
    const documentListeners = new Map<string, () => void>();
    const windowListeners = new Map<string, () => void>();
    const document = {
        title: 'AgentHub',
        visibilityState: 'hidden' as 'hidden' | 'visible',
        hasFocus: vi.fn(() => false),
        addEventListener: vi.fn((event: string, listener: () => void) => documentListeners.set(event, listener)),
        removeEventListener: vi.fn((event: string, listener: () => void) => {
            if (documentListeners.get(event) === listener) documentListeners.delete(event);
        }),
    };
    const window = {
        addEventListener: vi.fn((event: string, listener: () => void) => windowListeners.set(event, listener)),
        removeEventListener: vi.fn((event: string, listener: () => void) => {
            if (windowListeners.get(event) === listener) windowListeners.delete(event);
        }),
    };
    return {
        document,
        window,
        emitDocument: (event: string) => documentListeners.get(event)?.(),
        emitWindow: (event: string) => windowListeners.get(event)?.(),
    };
}

describe('web tab title unread controller', () => {
    it('increments only while hidden/unfocused and strips its own prefix', () => {
        const browser = createBrowserFixture();
        const controller = createWebTabTitleController(browser);

        controller.notifyUnreadMessage();
        controller.notifyUnreadMessage();
        expect(browser.document.title).toBe('(2) AgentHub');

        browser.document.visibilityState = 'visible';
        browser.document.hasFocus.mockReturnValue(true);
        browser.emitDocument('visibilitychange');
        expect(browser.document.title).toBe('AgentHub');

        controller.notifyUnreadMessage();
        expect(browser.document.title).toBe('AgentHub');
    });

    it('resets when focus returns and removes listeners on dispose', () => {
        const browser = createBrowserFixture();
        const controller = createWebTabTitleController(browser);

        controller.notifyUnreadMessage();
        expect(browser.document.title).toBe('(1) AgentHub');
        browser.document.hasFocus.mockReturnValue(true);
        browser.document.visibilityState = 'visible';
        browser.emitWindow('focus');
        expect(browser.document.title).toBe('AgentHub');

        controller.dispose();
        expect(browser.document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        expect(browser.window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    });

    it('does not touch native titles', () => {
        const browser = createBrowserFixture();
        const controller = createWebTabTitleController({ ...browser, platform: 'ios' });

        controller.notifyUnreadMessage();
        expect(browser.document.title).toBe('AgentHub');
        expect(browser.document.addEventListener).not.toHaveBeenCalled();
    });
});
