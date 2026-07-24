import { existsSync, mkdirSync, readFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWritePrivateJson } from '@/utils/atomicPrivateJson';

export type TerminalOutboxEntry = {
  content: string;
  localId: string;
};

type JournalFile = {
  version: 1;
  messages: TerminalOutboxEntry[];
  sessionEnd?: {
    sessionId: string;
    time: number;
  };
};

function isEntry(value: unknown): value is TerminalOutboxEntry {
  return !!value
    && typeof value === 'object'
    && typeof (value as TerminalOutboxEntry).content === 'string'
    && typeof (value as TerminalOutboxEntry).localId === 'string'
    && (value as TerminalOutboxEntry).localId.length > 0;
}

export class TerminalOutboxJournal {
  private readonly filePath: string;
  private messages: TerminalOutboxEntry[] | null = null;
  private sessionEnd: JournalFile['sessionEnd'] = undefined;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    chmodSync(dirname(filePath), 0o700);
  }

  load(): TerminalOutboxEntry[] {
    if (this.messages) {
      return this.messages.map((message) => ({ ...message }));
    }

    if (!existsSync(this.filePath)) {
      this.messages = [];
      this.persist();
      return [];
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<JournalFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.messages)) {
        throw new Error('unsupported journal format');
      }
      const seen = new Set<string>();
      this.messages = parsed.messages.filter(isEntry).filter((message) => {
        if (seen.has(message.localId)) return false;
        seen.add(message.localId);
        return true;
      }).map((message) => ({ content: message.content, localId: message.localId }));
      this.sessionEnd = parsed.sessionEnd
        && typeof parsed.sessionEnd.sessionId === 'string'
        && typeof parsed.sessionEnd.time === 'number'
        ? { sessionId: parsed.sessionEnd.sessionId, time: parsed.sessionEnd.time }
        : undefined;
      this.persist();
    } catch {
      try {
        renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}-${randomUUID()}`);
      } catch { /* best effort quarantine */ }
      this.messages = [];
      this.persist();
    }

    return this.messages.map((message) => ({ ...message }));
  }

  append(entry: TerminalOutboxEntry): void {
    const messages = this.load();
    if (messages.some((message) => message.localId === entry.localId)) return;
    messages.push({ content: entry.content, localId: entry.localId });
    this.messages = messages;
    this.persist();
  }

  acknowledge(localIds: string[]): void {
    const acknowledged = new Set(localIds);
    this.messages = this.load().filter((message) => !acknowledged.has(message.localId));
    this.persist();
  }

  markSessionEnd(sessionId: string, time: number): void {
    this.load();
    this.sessionEnd = { sessionId, time };
    this.persist();
  }

  pendingSessionEnd(): JournalFile['sessionEnd'] | null {
    this.load();
    return this.sessionEnd ? { ...this.sessionEnd } : null;
  }

  consumeSessionEnd(): JournalFile['sessionEnd'] | null {
    const pending = this.pendingSessionEnd();
    this.sessionEnd = undefined;
    this.persist();
    return pending ? { ...pending } : null;
  }

  private persist(): void {
    atomicWritePrivateJson(this.filePath, {
      version: 1,
      messages: this.messages ?? [],
      ...(this.sessionEnd ? { sessionEnd: this.sessionEnd } : {}),
    } satisfies JournalFile);
  }
}
