import type { RawJSONLines } from '../types';

/**
 * Extract the plain text of a genuine, user-typed message from a parsed
 * Claude Code jsonl log line.
 *
 * Returns null for anything that is not real user input, i.e.:
 *  - non-`user` lines (assistant / summary / system)
 *  - sidechain (subagent) lines, which are emitted as agent output
 *  - meta lines
 *  - tool_result lines (these come back as `type: 'user'` with an array of
 *    `tool_result` blocks and are tool output, not typed input)
 *
 * `message.content` is either a string, or an array of content blocks where
 * the typed text lives in `{ type: 'text', text }` blocks.
 */
export function extractUserMessageText(line: RawJSONLines): string | null {
    if (line.type !== 'user') {
        return null;
    }

    const raw = line as { isSidechain?: unknown; isMeta?: unknown };
    if (raw.isSidechain === true || raw.isMeta === true) {
        return null;
    }

    const content = (line as { message?: { content?: unknown } }).message?.content;

    let text: string;
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        text = content
            .filter((block): block is { type: 'text'; text: string } =>
                !!block
                && typeof block === 'object'
                && (block as { type?: unknown }).type === 'text'
                && typeof (block as { text?: unknown }).text === 'string')
            .map((block) => block.text)
            .join('');
    } else {
        return null;
    }

    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}
