const MAX_WEBVIEW_HEIGHT = 1_000_000;

function serializeForInlineScript(value: string): string {
    return JSON.stringify(value)
        .replace(/&/g, '\\u0026')
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function serializeBundledScript(value: string): string {
    return value
        .replace(/<\/script/gi, '<\\/script')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function safeBackgroundColor(value: string): string {
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#1a1a1a';
}

export function buildMermaidWebViewHtml(options: {
    content: string;
    backgroundColor: string;
    bridgeToken: string;
    scriptNonce: string;
    mermaidScript: string;
}): string {
    const content = serializeForInlineScript(options.content);
    const bridgeToken = serializeForInlineScript(options.bridgeToken);
    const backgroundColor = safeBackgroundColor(options.backgroundColor);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(options.scriptNonce)) {
        throw new Error('Invalid Mermaid WebView script nonce');
    }
    const scriptNonce = options.scriptNonce;
    const mermaidScript = serializeBundledScript(options.mermaidScript);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
  <script nonce="${scriptNonce}">${mermaidScript}</script>
  <style nonce="${scriptNonce}">
    html, body { margin: 0; padding: 0; background-color: ${backgroundColor}; }
    body { padding: 16px; }
    #mermaid-container { display: flex; justify-content: center; align-items: center; width: 100%; }
    #mermaid-container svg { max-width: 100%; height: auto; }
    .error { color: #ff6b6b; font-family: monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="mermaid-container"></div>
  <script nonce="${scriptNonce}">
    (async function () {
      'use strict';
      const content = ${content};
      const bridgeToken = ${bridgeToken};
      const container = document.getElementById('mermaid-container');
      const postDimensions = function () {
        const height = Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
        if (!Number.isFinite(height)) return;
        const message = JSON.stringify({ version: 1, type: 'dimensions', bridgeToken, height });
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(message);
        } else if (window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      };
      try {
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        const result = await mermaid.render('mermaid-diagram', content);
        container.innerHTML = result.svg;
      } catch (error) {
        document.getElementById('dmermaid-diagram')?.remove();
        const errorElement = document.createElement('div');
        errorElement.className = 'error';
        errorElement.textContent = 'Diagram error: ' + (error && error.message ? error.message : String(error));
        container.replaceChildren(errorElement);
      }
      postDimensions();
      if (typeof ResizeObserver === 'function') {
        new ResizeObserver(postDimensions).observe(container);
      }
    })();
  </script>
</body>
</html>`;
}

export function parseMermaidWebViewMessage(raw: string, expectedBridgeToken: string): { height: number } | null {
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object') return null;
        const message = value as Record<string, unknown>;
        if (
            message.version !== 1
            || message.type !== 'dimensions'
            || message.bridgeToken !== expectedBridgeToken
            || typeof message.height !== 'number'
            || !Number.isFinite(message.height)
            || message.height <= 0
            || message.height > MAX_WEBVIEW_HEIGHT
        ) {
            return null;
        }
        return { height: Math.ceil(message.height) };
    } catch {
        return null;
    }
}

export function parseMermaidWebFrameMessage(
    event: { data: unknown; source: unknown },
    expectedSource: unknown,
    expectedBridgeToken: string,
): { height: number } | null {
    if (!expectedSource || event.source !== expectedSource || typeof event.data !== 'string') return null;
    return parseMermaidWebViewMessage(event.data, expectedBridgeToken);
}

export function shouldAllowMermaidNavigation(url: string): boolean {
    return url === 'about:blank';
}

export function removeMermaidTemporaryContainer(
    documentLike: { getElementById: (id: string) => { remove: () => void } | null },
    renderId: string,
): void {
    documentLike.getElementById(`d${renderId}`)?.remove();
}
