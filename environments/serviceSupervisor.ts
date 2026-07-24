import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

type ServiceSupervisorConfig = {
  command: string;
  args: string[];
  logFile: string;
  maxFiles: number;
  maxBytes: number;
};

const MAX_PENDING_LINE_BYTES = 64 * 1024;
const OVERSIZED_LINE_MARKER = '[TRUNCATED OVERSIZED LOG LINE]\n';

export function redactEnvironmentLogText(value: string): string {
  return value
    .replace(/([?&](?:dev_token|dev_secret)=)[^&\s]*/gi, '$1[REDACTED]')
    .replace(/(\b(?:authorization|proxy-authorization)\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(\b(?:access[_-]?token|refresh[_-]?token|api[_-]?key|secret)\s*[:=]\s*)[^\s,;&]+/gi, '$1[REDACTED]');
}

class BoundedLogWriter {
  private fd: number;
  private size: number;

  constructor(
    private readonly logFile: string,
    private readonly maxFiles: number,
    private readonly maxBytes: number,
  ) {
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new RangeError('maxFiles must be a positive integer');
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be a positive integer');
    fs.mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 });
    this.removeOutOfBudgetArchives();
    this.normalizeExistingCurrentFile();
    this.fd = fs.openSync(logFile, 'a', 0o600);
    fs.chmodSync(logFile, 0o600);
    this.size = fs.fstatSync(this.fd).size;
  }

  write(value: string): void {
    const buffer = Buffer.from(value);
    let offset = 0;
    while (offset < buffer.length) {
      if (this.size >= this.maxBytes) this.rotate();
      const writable = Math.min(this.maxBytes - this.size, buffer.length - offset);
      fs.writeSync(this.fd, buffer, offset, writable);
      this.size += writable;
      offset += writable;
    }
  }

  close(): void {
    try { fs.fsyncSync(this.fd); } catch {}
    try { fs.closeSync(this.fd); } catch {}
  }

  private archivePath(index: number): string {
    return `${this.logFile}.${index}`;
  }

  private normalizeExistingCurrentFile(): void {
    if (!fs.existsSync(this.logFile)) return;
    const content = fs.readFileSync(this.logFile);
    if (content.length === 0) return;
    const redacted = Buffer.from(redactEnvironmentLogText(
      content.subarray(Math.max(0, content.length - this.maxBytes)).toString('utf8'),
    ));
    const tail = redacted.subarray(Math.max(0, redacted.length - this.maxBytes));
    if (this.maxFiles === 1) {
      fs.writeFileSync(this.logFile, tail, { mode: 0o600 });
      return;
    }
    this.shiftArchives();
    fs.writeFileSync(this.archivePath(1), tail, { mode: 0o600 });
    fs.unlinkSync(this.logFile);
  }

  private removeOutOfBudgetArchives(): void {
    const directory = path.dirname(this.logFile);
    const prefix = `${path.basename(this.logFile)}.`;
    for (const name of fs.readdirSync(directory)) {
      if (!name.startsWith(prefix)) continue;
      const index = Number(name.slice(prefix.length));
      if (!Number.isInteger(index) || index < this.maxFiles) continue;
      try { fs.unlinkSync(path.join(directory, name)); } catch {}
    }
  }

  private shiftArchives(): void {
    const lastArchive = this.maxFiles - 1;
    if (lastArchive < 1) return;
    try { fs.unlinkSync(this.archivePath(lastArchive)); } catch {}
    for (let index = lastArchive - 1; index >= 1; index -= 1) {
      const source = this.archivePath(index);
      if (!fs.existsSync(source)) continue;
      try { fs.renameSync(source, this.archivePath(index + 1)); } catch {}
    }
  }

  private rotate(): void {
    try { fs.fsyncSync(this.fd); } catch {}
    fs.closeSync(this.fd);
    this.shiftArchives();
    if (this.maxFiles > 1 && fs.existsSync(this.logFile)) {
      fs.renameSync(this.logFile, this.archivePath(1));
    } else {
      try { fs.unlinkSync(this.logFile); } catch {}
    }
    this.fd = fs.openSync(this.logFile, 'w', 0o600);
    this.size = 0;
  }
}

class RedactingLineWriter {
  private readonly decoder = new StringDecoder('utf8');
  private pending = '';
  private droppingOversizedLine = false;

  constructor(private readonly output: BoundedLogWriter) {}

  push(chunk: Buffer): void {
    this.pending += this.decoder.write(chunk);
    this.flushCompleteLines();
  }

  close(): void {
    this.pending += this.decoder.end();
    if (!this.droppingOversizedLine && this.pending.length > 0) {
      this.output.write(redactEnvironmentLogText(this.pending));
    }
    this.pending = '';
    this.output.close();
  }

  private flushCompleteLines(): void {
    while (this.pending.length > 0) {
      if (this.droppingOversizedLine) {
        const newline = this.pending.indexOf('\n');
        if (newline < 0) {
          this.pending = '';
          return;
        }
        this.pending = this.pending.slice(newline + 1);
        this.droppingOversizedLine = false;
        continue;
      }

      const newline = this.pending.indexOf('\n');
      if (newline >= 0) {
        const line = this.pending.slice(0, newline + 1);
        this.pending = this.pending.slice(newline + 1);
        if (Buffer.byteLength(line) > MAX_PENDING_LINE_BYTES) {
          this.output.write(OVERSIZED_LINE_MARKER);
        } else {
          this.output.write(redactEnvironmentLogText(line));
        }
        continue;
      }

      if (Buffer.byteLength(this.pending) > MAX_PENDING_LINE_BYTES) {
        this.output.write(OVERSIZED_LINE_MARKER);
        this.pending = '';
        this.droppingOversizedLine = true;
      }
      return;
    }
  }
}

function decodeConfig(encoded: string | undefined): ServiceSupervisorConfig {
  if (!encoded) throw new Error('Missing service supervisor configuration');
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<ServiceSupervisorConfig>;
  if (typeof parsed.command !== 'string' || !Array.isArray(parsed.args) ||
      typeof parsed.logFile !== 'string' || !Number.isInteger(parsed.maxFiles) || !Number.isInteger(parsed.maxBytes)) {
    throw new Error('Invalid service supervisor configuration');
  }
  return parsed as ServiceSupervisorConfig;
}

export async function runServiceSupervisor(config: ServiceSupervisorConfig): Promise<number> {
  const log = new RedactingLineWriter(new BoundedLogWriter(config.logFile, config.maxFiles, config.maxBytes));
  const child = spawn(config.command, config.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout.on('data', (chunk: Buffer) => log.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => log.push(chunk));

  let stopping = false;
  const forward = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    try { child.kill(signal); } catch {}
  };
  process.once('SIGTERM', () => forward('SIGTERM'));
  process.once('SIGINT', () => forward('SIGINT'));

  return await new Promise<number>((resolve) => {
    child.once('error', (error) => {
      log.push(Buffer.from(`Failed to start managed service: ${error instanceof Error ? error.message : String(error)}\n`));
      log.close();
      resolve(1);
    });
    child.once('exit', (code, signal) => {
      if (signal) log.push(Buffer.from(`Managed service exited by signal ${signal}\n`));
      log.close();
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runServiceSupervisor(decodeConfig(process.argv[2]));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main();
}
