/**
 * Codex Reasoning Processor
 *
 * Handles streaming reasoning deltas and identifies reasoning tools for Codex.
 * The state machine is concrete because Claude uses a separate protocol.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';

export interface ReasoningToolCall {
    type: 'tool-call';
    name: string;
    callId: string;
    input: {
        title: string;
    };
    id: string;
}

export interface ReasoningToolResult {
    type: 'tool-call-result';
    callId: string;
    output: {
        content?: string;
        status?: 'completed' | 'canceled';
    };
    id: string;
}

export interface ReasoningMessage {
    type: 'reasoning';
    message: string;
    id: string;
}

export type ReasoningOutput = ReasoningToolCall | ReasoningToolResult | ReasoningMessage;

export class ReasoningProcessor {
    protected accumulator: string = '';
    protected inTitleCapture: boolean = false;
    protected titleBuffer: string = '';
    protected contentBuffer: string = '';
    protected hasTitle: boolean = false;
    protected currentCallId: string | null = null;
    protected toolCallStarted: boolean = false;
    protected currentTitle: string | null = null;
    protected onMessage: ((message: any) => void) | null = null;

    constructor(onMessage?: (message: any) => void) {
        this.onMessage = onMessage || null;
        this.reset();
    }

    protected getToolName(): string {
        return 'CodexReasoning';
    }

    protected getLogPrefix(): string {
        return '[ReasoningProcessor]';
    }

    setMessageCallback(callback: (message: any) => void): void {
        this.onMessage = callback;
    }

    handleSectionBreak(): void {
        this.finishCurrentToolCall('canceled');
        this.resetState();
        logger.debug(`${this.getLogPrefix()} Section break - reset state`);
    }

    protected processInput(input: string): void {
        this.accumulator += input;

        if (!this.inTitleCapture && !this.hasTitle && !this.contentBuffer) {
            if (this.accumulator.startsWith('**')) {
                this.inTitleCapture = true;
                this.titleBuffer = this.accumulator.substring(2);
                logger.debug(`${this.getLogPrefix()} Started title capture`);
            } else if (this.accumulator.length > 0) {
                this.contentBuffer = this.accumulator;
            }
        } else if (this.inTitleCapture) {
            this.titleBuffer = this.accumulator.substring(2);

            const titleEndIndex = this.titleBuffer.indexOf('**');
            if (titleEndIndex !== -1) {
                const title = this.titleBuffer.substring(0, titleEndIndex);
                const afterTitle = this.titleBuffer.substring(titleEndIndex + 2);

                this.hasTitle = true;
                this.inTitleCapture = false;
                this.currentTitle = title;
                this.contentBuffer = afterTitle;
                this.currentCallId = randomUUID();

                logger.debug(`${this.getLogPrefix()} Title captured: "${title}"`);
                this.sendToolCallStart(title);
            }
        } else if (this.hasTitle) {
            const titleStartIndex = this.accumulator.indexOf('**');
            if (titleStartIndex !== -1) {
                this.contentBuffer = this.accumulator.substring(
                    titleStartIndex + 2 +
                    this.currentTitle!.length + 2
                );
            }
        } else {
            this.contentBuffer = this.accumulator;
        }
    }

    protected sendToolCallStart(title: string): void {
        if (!this.currentCallId || this.toolCallStarted) {
            return;
        }

        const toolCall: ReasoningToolCall = {
            type: 'tool-call',
            name: this.getToolName(),
            callId: this.currentCallId,
            input: { title },
            id: randomUUID()
        };

        logger.debug(`${this.getLogPrefix()} Sending tool call start for: "${title}"`);
        this.onMessage?.(toolCall);
        this.toolCallStarted = true;
    }

    protected completeReasoning(fullText?: string): boolean {
        const text = fullText ?? this.accumulator;

        if (!text.trim() && !this.toolCallStarted) {
            logger.debug(`${this.getLogPrefix()} Complete called but no content accumulated, skipping`);
            return false;
        }

        let title: string | undefined;
        let content: string = text;

        if (text.startsWith('**')) {
            const titleEndIndex = text.indexOf('**', 2);
            if (titleEndIndex !== -1) {
                title = text.substring(2, titleEndIndex);
                content = text.substring(titleEndIndex + 2).trim();
            }
        }

        logger.debug(`${this.getLogPrefix()} Complete reasoning - Title: "${title}", Has content: ${content.length > 0}`);

        if (title && !this.toolCallStarted) {
            this.currentCallId = this.currentCallId || randomUUID();
            this.sendToolCallStart(title);
        }

        if (this.toolCallStarted && this.currentCallId) {
            const toolResult: ReasoningToolResult = {
                type: 'tool-call-result',
                callId: this.currentCallId,
                output: {
                    content,
                    status: 'completed'
                },
                id: randomUUID()
            };
            logger.debug(`${this.getLogPrefix()} Sending tool call result`);
            this.onMessage?.(toolResult);
        } else if (content.trim()) {
            const reasoningMessage: ReasoningMessage = {
                type: 'reasoning',
                message: content,
                id: randomUUID()
            };
            logger.debug(`${this.getLogPrefix()} Sending reasoning message`);
            this.onMessage?.(reasoningMessage);
        }

        this.resetState();
        return true;
    }

    abort(): void {
        logger.debug(`${this.getLogPrefix()} Abort called`);
        this.finishCurrentToolCall('canceled');
        this.resetState();
    }

    reset(): void {
        this.finishCurrentToolCall('canceled');
        this.resetState();
    }

    protected finishCurrentToolCall(status: 'completed' | 'canceled'): void {
        if (this.toolCallStarted && this.currentCallId) {
            const toolResult: ReasoningToolResult = {
                type: 'tool-call-result',
                callId: this.currentCallId,
                output: {
                    content: this.contentBuffer || '',
                    status
                },
                id: randomUUID()
            };
            logger.debug(`${this.getLogPrefix()} Sending tool call result with status: ${status}`);
            this.onMessage?.(toolResult);
        }
    }

    protected resetState(): void {
        this.accumulator = '';
        this.inTitleCapture = false;
        this.titleBuffer = '';
        this.contentBuffer = '';
        this.hasTitle = false;
        this.currentCallId = null;
        this.toolCallStarted = false;
        this.currentTitle = null;
    }

    getCurrentCallId(): string | null {
        return this.currentCallId;
    }

    hasStartedToolCall(): boolean {
        return this.toolCallStarted;
    }

    processDelta(delta: string): void {
        this.processInput(delta);
    }

    complete(fullText: string): void {
        this.completeReasoning(fullText);
    }
}
