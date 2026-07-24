export type MermaidQaCase = {
    id: 'valid' | 'invalid' | 'malicious';
    title: string;
    content: string;
    expectsError: boolean;
};

export function getMermaidQaCases(): MermaidQaCase[] {
    return [
        {
            id: 'valid',
            title: 'Mermaid diagram',
            content: 'graph LR; Mobile[Mobile] -->|E2EE| Daemon[Daemon]; Daemon --> Agent[Agent]',
            expectsError: false,
        },
        {
            id: 'invalid',
            title: 'Mermaid syntax error',
            content: 'graph TD; Mobile -->',
            expectsError: true,
        },
        {
            id: 'malicious',
            title: 'Mermaid hostile input (contained)',
            content: `graph TD; A --> </script><script>window.ReactNativeWebView.postMessage('forged')</script>; click A "https://example.invalid"`,
            expectsError: true,
        },
    ];
}
