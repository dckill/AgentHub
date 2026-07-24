export type MessageCatchupCheckpoint = {
    minSeq: number | null;
    maxSeq: number | null;
};

type MessageCatchupCommit<T> = MessageCatchupCheckpoint & {
    messages: T[];
};

export class MessageCatchupBuffer<T> {
    private messages: T[] = [];
    private minSeq: number | null = null;
    private maxSeq: number | null = null;

    constructor(
        private readonly commitThreshold: number,
        private readonly commit: (batch: MessageCatchupCommit<T>) => void,
    ) {
        if (!Number.isSafeInteger(commitThreshold) || commitThreshold < 1) {
            throw new Error('Message catch-up commit threshold must be a positive integer');
        }
    }

    push(messages: readonly T[], checkpoint: MessageCatchupCheckpoint) {
        this.messages.push(...messages);
        if (checkpoint.minSeq !== null) {
            this.minSeq = this.minSeq === null
                ? checkpoint.minSeq
                : Math.min(this.minSeq, checkpoint.minSeq);
        }
        if (checkpoint.maxSeq !== null) {
            this.maxSeq = this.maxSeq === null
                ? checkpoint.maxSeq
                : Math.max(this.maxSeq, checkpoint.maxSeq);
        }
        if (this.messages.length >= this.commitThreshold) {
            this.flush();
        }
    }

    flush() {
        if (this.messages.length === 0 && this.maxSeq === null) {
            return;
        }
        this.commit({
            messages: this.messages,
            minSeq: this.minSeq,
            maxSeq: this.maxSeq,
        });
        this.messages = [];
        this.minSeq = null;
        this.maxSeq = null;
    }
}
