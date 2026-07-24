/**
 * Tests for difftastic module
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getBinaryPath, run } from './index';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('difftastic', () => {
    let testDir: string;
    let file1Path: string;
    let file2Path: string;

    beforeAll(() => {
        // Create test directory and files
        testDir = join(tmpdir(), `difftastic-test-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        
        file1Path = join(testDir, 'file1.txt');
        file2Path = join(testDir, 'file2.txt');
        
        writeFileSync(file1Path, 'Hello\nWorld\nTest\n');
        writeFileSync(file2Path, 'Hello\nModified\nTest\n');
        
        return () => {
            // Cleanup
            rmSync(testDir, { recursive: true, force: true });
        };
    });

    it('should show version', async () => {
        const result = await run(['--version']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Difftastic');
    });

    it('resolves the binary from the prepared runtime tools directory', () => {
        const previous = process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
        process.env.AGENTHUB_INTERNAL_TOOLS_DIR = join(testDir, 'private-tools');
        try {
            expect(getBinaryPath()).toBe(join(testDir, 'private-tools', process.platform === 'win32' ? 'difft.exe' : 'difft'));
        } finally {
            if (previous === undefined) delete process.env.AGENTHUB_INTERNAL_TOOLS_DIR;
            else process.env.AGENTHUB_INTERNAL_TOOLS_DIR = previous;
        }
    });

    it('should compare two files', async () => {
        const result = await run([file1Path, file2Path]);
        // Difftastic returns 0 even when files differ (unlike traditional diff)
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('file2.txt');
        expect(result.stdout).toContain('World');
        expect(result.stdout).toContain('Modified');
    });

    it('should respect color option', async () => {
        const result = await run(['--color', 'never', file1Path, file2Path]);
        expect(result.exitCode).toBe(0);
        // Check that ANSI color codes are not present
        expect(result.stdout).not.toContain('\x1b[');
    });

    it('should list languages', async () => {
        const result = await run(['--list-languages']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('JavaScript');
        expect(result.stdout).toContain('TypeScript');
        expect(result.stdout).toContain('Python');
    });

    it('should handle missing files', async () => {
        const result = await run(['nonexistent.txt', 'alsonothere.txt']);
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toBeTruthy();
    });
});
