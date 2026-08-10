import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cliRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(cliRoot, 'api/api.ts'), 'utf8');
const indexSource = fs.readFileSync(path.join(cliRoot, 'index.ts'), 'utf8');

describe('obsolete vendor connect boundary', () => {
    it('removes client calls for server routes that no longer exist', () => {
        expect(apiSource).not.toContain('/v1/connect/');
        expect(apiSource).not.toContain('registerVendorToken');
        expect(apiSource).not.toContain('getVendorToken');
    });

    it('keeps the legacy command fail-closed with a migration hint and no auth implementation', () => {
        expect(indexSource).not.toContain("handleConnectCommand");
        expect(indexSource).toContain("subcommand === 'connect'");
        expect(indexSource).toContain('agenthub auth login');
        expect(indexSource).toContain('已下线');
        expect(fs.existsSync(path.join(cliRoot, 'commands/connect.ts'))).toBe(false);
        expect(fs.existsSync(path.join(cliRoot, 'commands/connect/authenticateCodex.ts'))).toBe(false);
        expect(fs.existsSync(path.join(cliRoot, 'commands/connect/authenticateClaude.ts'))).toBe(false);
    });
});
