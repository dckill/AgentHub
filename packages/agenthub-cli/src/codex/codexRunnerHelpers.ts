import { hashObject } from '@/utils/deterministicJson';
import { CHANGE_TITLE_INSTRUCTION } from '@/codex/constants';
import type { InlineImage } from './utils/imageInput';

export function buildCodexTurnPrompt(opts: {
    message: string;
    appendSystemPrompt?: string;
    includeAppendSystemPrompt: boolean;
    includeTitleInstruction: boolean;
}): string {
    const parts: string[] = [];
    if (opts.includeAppendSystemPrompt && opts.appendSystemPrompt) {
        parts.push(opts.appendSystemPrompt);
    }
    parts.push(opts.message);
    if (opts.includeTitleInstruction) {
        parts.push(CHANGE_TITLE_INSTRUCTION);
    }
    return parts.join('\n\n');
}

export function buildCodexMessageModeHash(mode: {
    permissionMode: import('@/api/types').PermissionMode;
    model?: string;
    effort?: string;
    clientUserMessageId?: string;
    appendSystemPrompt?: string;
    images?: InlineImage[];
}): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        effort: mode.effort,
        clientUserMessageId: mode.clientUserMessageId,
        appendSystemPrompt: mode.appendSystemPrompt,
        images: mode.images?.map((image) => ({
            mimeType: image.mimeType,
            length: image.data.length,
            prefix: image.data.slice(0, 24),
        })),
    });
}

export function shouldTerminateCodexSessionAfterError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /stdin not writable|Codex process exited|Codex process disconnected|write EPIPE/i.test(message);
}

/**
 * Extracts a human-readable error from a codex task_complete/turn_aborted event.
 * Returns null if the event represents a successful/clean completion.
 */
export function describeCodexFailure(msg: any): string | null {
    const hasFailure = msg?.status === 'failed' || (msg?.error !== undefined && msg?.error !== null);
    if (!hasFailure) return null;
    const err = msg.error;
    if (typeof err === 'string' && err.length > 0) return err;
    if (err && typeof err === 'object' && typeof err.message === 'string' && err.message.length > 0) {
        return err.message;
    }
    return 'Unknown error';
}
