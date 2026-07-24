import type { SupportedLanguage } from './_all';

interface DocumentLanguageTarget {
    documentElement: {
        setAttribute(name: string, value: string): void;
    };
}

export function applyWebDocumentLanguage(
    language: SupportedLanguage,
    targetDocument: DocumentLanguageTarget | undefined = typeof document === 'undefined' ? undefined : document,
): void {
    targetDocument?.documentElement.setAttribute('lang', language);
}
