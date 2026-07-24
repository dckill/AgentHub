import type { Message } from '@/sync/typesMessage';

const OPTIONS_BLOCK_PATTERN = /<options>\s*[\s\S]*?<option>[\s\S]*?<\/option>[\s\S]*?<\/options>/i;

export function hasOptionsBlock(text: string): boolean {
    return OPTIONS_BLOCK_PATTERN.test(text);
}

export function getInteractiveOptionsMessageId(messages: Message[]): string | null {
    const newest = messages.reduce<Message | null>((latest, message) => {
        if (!latest || message.createdAt > latest.createdAt) {
            return message;
        }
        return latest;
    }, null);

    if (newest?.kind !== 'agent-text' || newest.isThinking) {
        return null;
    }

    return hasOptionsBlock(newest.text) ? newest.id : null;
}
