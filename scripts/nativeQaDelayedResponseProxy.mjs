import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';

function waitFor(predicate, timeoutMs, description) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const check = () => {
            const value = predicate();
            if (value) {
                resolve(value);
                return;
            }
            if (Date.now() >= deadline) {
                reject(new Error(`Timed out waiting for ${description}`));
                return;
            }
            setTimeout(check, 10);
        };
        check();
    });
}

function targetPath(target, requestUrl) {
    const requestPath = requestUrl || '/';
    if (target.pathname === '/') {
        return requestPath;
    }
    return `${target.pathname.replace(/\/$/, '')}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`;
}

export async function startNativeQaDelayedResponseProxy(options) {
    const target = new URL(options.targetOrigin);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw new Error(`Unsupported Native QA proxy target protocol: ${target.protocol}`);
    }

    const events = [];
    const heldResponses = new Map();
    let armed = null;
    let nextEventId = 1;

    const server = createServer((request, response) => {
        const pathname = new URL(request.url || '/', 'http://agenthub-native-qa.invalid').pathname;
        const forward = target.protocol === 'https:' ? httpsRequest : httpRequest;
        const upstreamRequest = forward({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || undefined,
            method: request.method,
            path: targetPath(target, request.url),
            headers: {
                ...request.headers,
                host: target.host,
            },
        }, (upstreamResponse) => {
            const shouldHold = armed && armed.remaining > 0 && pathname === armed.pathname;
            if (!shouldHold) {
                response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.statusMessage, upstreamResponse.headers);
                upstreamResponse.pipe(response);
                return;
            }

            armed.remaining -= 1;
            upstreamResponse.pause();
            const event = {
                id: nextEventId++,
                pathname,
                heldAt: new Date().toISOString(),
                outcome: 'held',
            };
            events.push(event);
            heldResponses.set(event.id, { event, response, upstreamResponse });

            response.once('close', () => {
                if (event.outcome !== 'held') {
                    return;
                }
                event.outcome = 'downstream-aborted';
                event.completedAt = new Date().toISOString();
                heldResponses.delete(event.id);
                upstreamResponse.destroy();
            });
        });

        upstreamRequest.once('error', (error) => {
            if (!response.headersSent) {
                response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
            }
            response.end(`Native QA proxy upstream error: ${error.message}`);
        });
        request.pipe(upstreamRequest);
    });

    server.on('upgrade', (request, clientSocket, head) => {
        const connect = target.protocol === 'https:' ? connectTls : connectTcp;
        const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
        const upstreamSocket = connect({ host: target.hostname, port, servername: target.protocol === 'https:' ? target.hostname : undefined }, () => {
            const headerLines = [];
            for (let index = 0; index < request.rawHeaders.length; index += 2) {
                const name = request.rawHeaders[index];
                const value = request.rawHeaders[index + 1];
                headerLines.push(`${name.toLowerCase() === 'host' ? 'Host' : name}: ${name.toLowerCase() === 'host' ? target.host : value}`);
            }
            upstreamSocket.write(`${request.method} ${targetPath(target, request.url)} HTTP/${request.httpVersion}\r\n${headerLines.join('\r\n')}\r\n\r\n`);
            if (head.length > 0) {
                upstreamSocket.write(head);
            }
            clientSocket.pipe(upstreamSocket).pipe(clientSocket);
        });
        upstreamSocket.once('error', () => clientSocket.destroy());
        clientSocket.once('error', () => upstreamSocket.destroy());
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port || 0, options.host || '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Native QA delayed response proxy did not bind a TCP port');
    }

    return {
        origin: `http://${address.address}:${address.port}`,
        events,
        arm({ pathname, matches = 1 }) {
            if (!pathname.startsWith('/')) {
                throw new Error('Native QA delayed response pathname must start with /');
            }
            if (!Number.isSafeInteger(matches) || matches < 1) {
                throw new Error('Native QA delayed response matches must be a positive integer');
            }
            armed = { pathname, remaining: matches };
        },
        waitForHeldResponse(timeoutMs = 10_000) {
            return waitFor(() => events.find((event) => event.outcome === 'held'), timeoutMs, 'a held Native QA response');
        },
        waitForOutcome(outcome, timeoutMs = 10_000) {
            return waitFor(() => events.find((event) => event.outcome === outcome), timeoutMs, `Native QA response outcome ${outcome}`);
        },
        releaseHeldResponses() {
            let released = 0;
            for (const [id, held] of heldResponses) {
                if (held.event.outcome !== 'held') {
                    continue;
                }
                held.event.outcome = 'released';
                held.event.completedAt = new Date().toISOString();
                held.response.writeHead(
                    held.upstreamResponse.statusCode || 502,
                    held.upstreamResponse.statusMessage,
                    held.upstreamResponse.headers,
                );
                held.upstreamResponse.pipe(held.response);
                held.upstreamResponse.resume();
                heldResponses.delete(id);
                released += 1;
            }
            return released;
        },
        async close() {
            for (const held of heldResponses.values()) {
                held.upstreamResponse.destroy();
                held.response.destroy();
            }
            heldResponses.clear();
            await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        },
    };
}
