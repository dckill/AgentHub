import { pathToFileURL } from 'node:url';
import { configuration } from '@/configuration';
import { decodeBase64, encodeBase64, encrypt } from '@/api/encryption';
import { readCredentials, readPersistedSessions } from '@/persistence';

const MAX_PERFORMANCE_MESSAGES = 10_000;
const PERFORMANCE_BATCH_SIZE = 100;

type PlaintextFixtureMessage = {
  localId: string;
  content: {
    role: 'user';
    content: { type: 'text'; text: string };
    meta: { sentFrom: 'performance-fixture' };
  };
};

export function buildPerformancePlaintextMessages(
  sessionId: string,
  count: number,
  prefix: string,
): PlaintextFixtureMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    return {
      localId: `perf-${sessionId}-${sequence}`,
      content: {
        role: 'user' as const,
        content: { type: 'text' as const, text: `${prefix} ${sequence}` },
        meta: { sentFrom: 'performance-fixture' as const },
      },
    };
  });
}

export function parsePerformanceFixtureArgs(args: string[]): {
  sessionId: string;
  count: number;
  prefix: string;
} {
  const valueAfter = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const sessionId = valueAfter('--session')?.trim();
  if (!sessionId) throw new Error('A non-empty --session id is required');
  const countRaw = valueAfter('--count') ?? String(MAX_PERFORMANCE_MESSAGES);
  const count = Number(countRaw);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PERFORMANCE_MESSAGES) {
    throw new Error('--count must be an integer in the range 1..10000');
  }
  const prefix = valueAfter('--prefix')?.trim() || 'performance message';
  return { sessionId, count, prefix };
}

export async function seedPerformanceSession(
  sessionId: string,
  count: number,
  prefix: string,
): Promise<{ sessionId: string; count: number; batches: number }> {
  const credentials = await readCredentials();
  if (!credentials) throw new Error('Authenticated CLI credentials are unavailable');
  const persisted = readPersistedSessions()[sessionId];
  if (!persisted) throw new Error(`Persisted encryption state is unavailable for session ${sessionId}`);
  const key = decodeBase64(persisted.encryptionKey);
  const plaintext = buildPerformancePlaintextMessages(sessionId, count, prefix);
  let batches = 0;

  for (let offset = 0; offset < plaintext.length; offset += PERFORMANCE_BATCH_SIZE) {
    const batch = plaintext.slice(offset, offset + PERFORMANCE_BATCH_SIZE).map((message) => ({
      localId: message.localId,
      content: encodeBase64(encrypt(key, persisted.encryptionVariant, message.content)),
    }));
    const response = await fetch(`${configuration.serverUrl}/v3/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: batch }),
    });
    if (!response.ok) {
      throw new Error(`Performance fixture batch ${batches + 1} failed with HTTP ${response.status}`);
    }
    batches += 1;
  }

  return { sessionId, count, batches };
}

async function main(): Promise<void> {
  const options = parsePerformanceFixtureArgs(process.argv.slice(2));
  const result = await seedPerformanceSession(options.sessionId, options.count, options.prefix);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
