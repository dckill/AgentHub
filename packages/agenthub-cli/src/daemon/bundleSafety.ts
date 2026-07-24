import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, copyFile, cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export type BundleFingerprint = {
  size: number;
  mtimeMs: number;
  sha256: string;
};

export type BundleValidationResult =
  | { ok: true; fingerprint: BundleFingerprint }
  | { ok: false; reason: string };

export async function readBundleFingerprint(bundlePath: string): Promise<BundleFingerprint> {
  const metadata = await lstat(bundlePath);
  if (!metadata.isFile()) {
    throw new Error('bundle candidate is not a regular file');
  }
  const contents = await readFile(bundlePath);
  return {
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

export async function readBundleTreeFingerprint(bundleDirectory: string): Promise<BundleFingerprint> {
  const hash = createHash('sha256');
  let size = 0;
  let mtimeMs = 0;

  const visit = async (currentPath: string, relativePath: string): Promise<void> => {
    const metadata = await lstat(currentPath);
    if (metadata.isSymbolicLink()) {
      throw new Error(`bundle tree refuses symlink: ${currentPath}`);
    }
    if (metadata.isDirectory()) {
      const entries = await readdir(currentPath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const childRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
        await visit(join(currentPath, entry.name), childRelativePath);
      }
      return;
    }
    if (!metadata.isFile()) {
      throw new Error(`bundle tree contains unsupported entry: ${currentPath}`);
    }
    const contents = await readFile(currentPath);
    hash.update(relativePath);
    hash.update('\0');
    hash.update(contents);
    size += metadata.size;
    mtimeMs = Math.max(mtimeMs, metadata.mtimeMs);
  };

  await visit(bundleDirectory, '');
  return {
    size,
    mtimeMs,
    sha256: hash.digest('hex'),
  };
}

/**
 * Validate a replacement before allowing the daemon to hand it to systemd.
 * `execFile` is intentional: a bundle path is untrusted filesystem input and
 * must never be interpolated into a shell command.
 */
export async function validateBundleCandidate(
  bundlePath: string,
  options: { nodePath?: string; timeoutMs?: number } = {},
): Promise<BundleValidationResult> {
  const nodePath = options.nodePath ?? process.execPath;
  const timeoutMs = options.timeoutMs ?? 5_000;

  try {
    // Validate the complete bundle tree before executing the entrypoint. A
    // symlinked dependent chunk could otherwise pass the entrypoint smoke
    // while escaping the trusted bundle directory.
    await readBundleTreeFingerprint(dirname(bundlePath));
    const fingerprint = await readBundleFingerprint(bundlePath);
    if (fingerprint.size === 0) {
      return { ok: false, reason: 'bundle candidate is empty' };
    }

    await execFile(nodePath, ['--check', bundlePath], {
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
    });
    await execFile(nodePath, [bundlePath, '--version'], {
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
    });

    return { ok: true, fingerprint };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function assertNoSymlinks(directoryPath: string): Promise<void> {
  const metadata = await lstat(directoryPath);
  if (!metadata.isDirectory()) {
    throw new Error(`bundle backup source is not a directory: ${directoryPath}`);
  }
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const childPath = join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`bundle backup refuses symlink: ${childPath}`);
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(childPath);
    }
  }
}

async function secureDirectory(directoryPath: string): Promise<void> {
  await chmod(directoryPath, 0o700);
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const childPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await secureDirectory(childPath);
    } else {
      await chmod(childPath, 0o600);
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function replaceDirectoryAtomically(temporaryPath: string, targetPath: string): Promise<void> {
  const displacedPath = `${targetPath}.old-${process.pid}-${randomUUID()}`;
  let displaced = false;
  try {
    if (await pathExists(targetPath)) {
      await rename(targetPath, displacedPath);
      displaced = true;
    }
    await rename(temporaryPath, targetPath);
    if (displaced) {
      await rm(displacedPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (displaced && !(await pathExists(targetPath))) {
      await rename(displacedPath, targetPath).catch(() => undefined);
    }
    throw error;
  }
}

async function atomicCopy(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  const sourceMetadata = await lstat(sourcePath);
  try {
    if (sourceMetadata.isDirectory()) {
      await assertNoSymlinks(sourcePath);
      await cp(sourcePath, temporaryPath, { recursive: true, force: true });
      await secureDirectory(temporaryPath);
      await replaceDirectoryAtomically(temporaryPath, targetPath);
    } else {
      if (!sourceMetadata.isFile()) {
        throw new Error(`bundle backup source is not a regular file: ${sourcePath}`);
      }
      await copyFile(sourcePath, temporaryPath);
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, targetPath);
    }
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeBundleBackup(bundlePath: string, backupPath: string): Promise<void> {
  await atomicCopy(bundlePath, backupPath);
}

export async function restoreBundleBackup(backupPath: string, bundlePath: string): Promise<void> {
  await atomicCopy(backupPath, bundlePath);
}
