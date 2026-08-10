import { dispatchCodexTransportLine, type CodexTransportLineDispatchOptions } from './codexTransportLineDispatch';

/** Options for routing one inbound app-server stdout line. */
export type CodexInboundTransportLifecycleOptions = CodexTransportLineDispatchOptions;

/**
 * Keep inbound JSON-RPC classification and epoch gating outside the client
 * state container while preserving the existing callback surface.
 */
export function routeCodexInboundTransportLine(
    options: CodexInboundTransportLifecycleOptions,
): void {
    dispatchCodexTransportLine(options);
}
