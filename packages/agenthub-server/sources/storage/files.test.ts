import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let tempRoot: string | null = null;

afterEach(() => {
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
    delete process.env.DATA_DIR;
    vi.resetModules();
});

describe('deleteSessionAttachments', () => {
    it('removes only the selected local session attachment directory', async () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-files-test-'));
        process.env.DATA_DIR = tempRoot;
        delete process.env.S3_HOST;
        vi.resetModules();
        const { putLocalFile, deleteSessionAttachments } = await import('./files');

        await putLocalFile('sessions/s1/attachments/a.enc', Buffer.from([1]));
        await putLocalFile('sessions/s2/attachments/b.enc', Buffer.from([2]));
        await deleteSessionAttachments('s1');

        expect(fs.existsSync(path.join(tempRoot, 'files/sessions/s1/attachments'))).toBe(false);
        expect(fs.existsSync(path.join(tempRoot, 'files/sessions/s2/attachments/b.enc'))).toBe(true);
    });
});
