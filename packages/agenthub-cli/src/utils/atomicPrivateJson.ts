import { closeSync, existsSync, fsyncSync, openSync, renameSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function atomicWritePrivateJson(
  filePath: string,
  value: unknown,
  hooks: { beforeRename?: () => void } = {},
): void {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(fileDescriptor, JSON.stringify(value, null, 2), 'utf8');
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    hooks.beforeRename?.();
    renameSync(temporaryPath, filePath);
    chmodSync(filePath, 0o600);

    // Persist the directory entry as well as the file contents on platforms
    // that allow fsync on a directory.
    try {
      const directoryDescriptor = openSync(dirname(filePath), 'r');
      try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    } catch { /* Windows and some filesystems do not support directory fsync. */ }
  } finally {
    if (fileDescriptor !== undefined) {
      try { closeSync(fileDescriptor); } catch { /* already closed */ }
    }
    if (existsSync(temporaryPath)) {
      try { unlinkSync(temporaryPath); } catch { /* best-effort cleanup */ }
    }
  }
}
