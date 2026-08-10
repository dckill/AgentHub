/**
 * Codex Permission Handler
 *
 * Handles tool permission requests and responses for Codex sessions.
 * The implementation is intentionally concrete: Claude has a different
 * permission protocol and does not share this lifecycle.
 */

import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import type { AgentState } from "@/api/types";

export interface PermissionResponse {
    id: string;
    approved: boolean;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

export interface PendingRequest {
    resolve: (value: PermissionResult) => void;
    reject: (error: Error) => void;
    toolName: string;
    input: unknown;
}

export interface PermissionResult {
    decision: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

export interface PermissionNotificationRequest {
    toolCallId: string;
    toolName: string;
    input: unknown;
    provider: string;
}

/** Options retained for the public Codex handler constructor contract. */
export interface BasePermissionHandlerOptions {
    provider?: string;
    notifyPermissionRequest?: (request: PermissionNotificationRequest) => void;
}

export class CodexPermissionHandler {
    protected pendingRequests = new Map<string, PendingRequest>();
    protected session: ApiSessionClient;
    private isResetting = false;
    private readonly options: BasePermissionHandlerOptions;

    // Exact tool names that should always be auto-approved. Include the bare
    // form (used by Codex elicitation messages like `tool "change_title"`)
    // and the MCP-qualified form for defense in depth.
    private static readonly ALWAYS_AUTO_APPROVE_NAMES: ReadonlySet<string> = new Set([
        'change_title',
        'mcp__agenthub__change_title',
    ]);

    // Tool-call IDs that should auto-approve when they exactly match one of
    // these values or start with `<name>-` (e.g. `change_title-1765385846663`).
    // Substring matching was a bypass vector — any tool whose ID happened to
    // contain `change_title` as a substring would be silently approved.
    private static readonly ALWAYS_AUTO_APPROVE_ID_PREFIXES: readonly string[] = [
        'change_title',
    ];

    constructor(session: ApiSessionClient, options: BasePermissionHandlerOptions = {}) {
        this.session = session;
        this.options = options;
        this.setupRpcHandler();
    }

    protected getLogPrefix(): string {
        return '[Codex]';
    }

    /** Update the session reference after offline reconnection swaps sessions. */
    updateSession(newSession: ApiSessionClient): void {
        logger.debug(`${this.getLogPrefix()} Session reference updated`);
        this.session = newSession;
        this.setupRpcHandler();
    }

    /** Setup RPC handler for permission responses. */
    protected setupRpcHandler(): void {
        this.session.rpcHandlerManager.registerHandler<PermissionResponse, void>(
            'permission',
            async (response) => {
                const pending = this.pendingRequests.get(response.id);
                if (!pending) {
                    logger.debug(`${this.getLogPrefix()} Permission request not found or already resolved`);
                    return;
                }

                this.pendingRequests.delete(response.id);

                const result: PermissionResult = response.approved
                    ? { decision: response.decision === 'approved_for_session' ? 'approved_for_session' : 'approved' }
                    : { decision: response.decision === 'denied' ? 'denied' : 'abort' };

                pending.resolve(result);

                this.session.updateAgentState((currentState) => {
                    const request = currentState.requests?.[response.id];
                    if (!request) return currentState;

                    const { [response.id]: _, ...remainingRequests } = currentState.requests || {};

                    const res = {
                        ...currentState,
                        requests: remainingRequests,
                        completedRequests: {
                            ...currentState.completedRequests,
                            [response.id]: {
                                ...request,
                                completedAt: Date.now(),
                                status: response.approved ? 'approved' : 'denied',
                                decision: result.decision
                            }
                        }
                    } satisfies AgentState;
                    return res;
                });

                logger.debug(`${this.getLogPrefix()} Permission ${response.approved ? 'approved' : 'denied'} for ${pending.toolName}`);
            }
        );
    }

    /** Add a pending request to the agent state. */
    protected addPendingRequestToState(toolCallId: string, toolName: string, input: unknown): void {
        this.session.updateAgentState((currentState) => ({
            ...currentState,
            requests: {
                ...currentState.requests,
                [toolCallId]: {
                    tool: toolName,
                    arguments: input,
                    createdAt: Date.now()
                }
            }
        }));
    }

    protected notifyPermissionRequest(toolCallId: string, toolName: string, input: unknown): void {
        if (!this.options.notifyPermissionRequest) {
            return;
        }

        try {
            this.options.notifyPermissionRequest({
                toolCallId,
                toolName,
                input,
                provider: this.options.provider ?? 'unknown',
            });
        } catch (error) {
            logger.debug(`${this.getLogPrefix()} Failed to send permission push notification:`, error);
        }
    }

    /** Resolve all pending requests as canceled by the user. */
    abortAll(): void {
        const pendingSnapshot = Array.from(this.pendingRequests.entries());
        if (pendingSnapshot.length === 0) return;

        this.pendingRequests.clear();

        for (const [id, pending] of pendingSnapshot) {
            try {
                pending.resolve({ decision: 'abort' });
            } catch (err) {
                logger.debug(`${this.getLogPrefix()} Error resolving aborted request ${id}:`, err);
            }
        }

        this.session.updateAgentState((currentState) => {
            const pendingRequests = currentState.requests || {};
            const completedRequests = { ...currentState.completedRequests };

            for (const [id, request] of Object.entries(pendingRequests)) {
                completedRequests[id] = {
                    ...request,
                    completedAt: Date.now(),
                    status: 'canceled',
                    reason: 'Aborted by user'
                };
            }

            return {
                ...currentState,
                requests: {},
                completedRequests
            };
        });

        logger.debug(`${this.getLogPrefix()} Aborted ${pendingSnapshot.length} pending permission(s)`);
    }

    /** Reset state for a new session. This method is idempotent. */
    reset(reason: string = 'Session reset'): void {
        if (this.isResetting) {
            logger.debug(`${this.getLogPrefix()} Reset already in progress, skipping`);
            return;
        }
        this.isResetting = true;

        try {
            const pendingSnapshot = Array.from(this.pendingRequests.entries());
            this.pendingRequests.clear();

            for (const [id, pending] of pendingSnapshot) {
                try {
                    pending.reject(new Error('Session reset'));
                } catch (err) {
                    logger.debug(`${this.getLogPrefix()} Error rejecting pending request ${id}:`, err);
                }
            }

            this.session.updateAgentState((currentState) => {
                const pendingRequests = currentState.requests || {};
                const completedRequests = { ...currentState.completedRequests };

                for (const [id, request] of Object.entries(pendingRequests)) {
                    completedRequests[id] = {
                        ...request,
                        completedAt: Date.now(),
                        status: 'canceled',
                        reason
                    };
                }

                return {
                    ...currentState,
                    requests: {},
                    completedRequests
                };
            });

            logger.debug(`${this.getLogPrefix()} Permission handler reset`);
        } finally {
            this.isResetting = false;
        }
    }

    private shouldAutoApprove(toolName: string, toolCallId: string): boolean {
        if (CodexPermissionHandler.ALWAYS_AUTO_APPROVE_NAMES.has(toolName)) {
            return true;
        }

        for (const prefix of CodexPermissionHandler.ALWAYS_AUTO_APPROVE_ID_PREFIXES) {
            if (toolCallId === prefix || toolCallId.startsWith(`${prefix}-`)) {
                return true;
            }
        }

        return false;
    }

    /** Handle a Codex tool permission request. */
    async handleToolCall(
        toolCallId: string,
        toolName: string,
        input: unknown
    ): Promise<PermissionResult> {
        if (this.shouldAutoApprove(toolName, toolCallId)) {
            logger.debug(`${this.getLogPrefix()} Auto-approving tool ${toolName} (${toolCallId})`);

            this.session.updateAgentState((currentState) => ({
                ...currentState,
                completedRequests: {
                    ...currentState.completedRequests,
                    [toolCallId]: {
                        tool: toolName,
                        arguments: input,
                        createdAt: Date.now(),
                        completedAt: Date.now(),
                        status: 'approved',
                        decision: 'approved',
                    },
                },
            } satisfies AgentState));

            return { decision: 'approved' };
        }

        return new Promise<PermissionResult>((resolve, reject) => {
            this.pendingRequests.set(toolCallId, {
                resolve,
                reject,
                toolName,
                input
            });

            this.addPendingRequestToState(toolCallId, toolName, input);
            this.notifyPermissionRequest(toolCallId, toolName, input);

            logger.debug(`${this.getLogPrefix()} Permission request sent for tool: ${toolName} (${toolCallId})`);
        });
    }
}
