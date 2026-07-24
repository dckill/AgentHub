import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

export interface LocalCredentialStatus {
    claude: boolean;
    codex: boolean;
    detectedAt: number;
}

/**
 * Detects whether each agent has local credentials configured on this machine.
 *
 * Checks:
 * - Claude: ~/.claude/settings.json env block for ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY
 * - Codex: CODEX_HOME/auth.json or environment variable
 */
export function detectLocalCredentials(): LocalCredentialStatus {
    const homeDir = os.homedir();

    // Claude: check ~/.claude/settings.json env block
    let claude = false;
    try {
        const settingsPath = join(homeDir, '.claude', 'settings.json');
        if (existsSync(settingsPath)) {
            const raw = readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(raw);
            if (settings.env) {
                claude = !!(settings.env.ANTHROPIC_AUTH_TOKEN || settings.env.ANTHROPIC_API_KEY);
            }
        }
    } catch {
        // Ignore parse errors or missing files
    }
    if (!claude) {
        claude = !!(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
    }

    // Codex: check CODEX_HOME/auth.json or env
    let codex = false;
    try {
        const codexHome = process.env.CODEX_HOME || join(homeDir, '.codex');
        codex = existsSync(join(codexHome, 'auth.json'));
    } catch {
        // Ignore
    }
    if (!codex) {
        codex = !!process.env.OPENAI_API_KEY;
    }

    return { claude, codex, detectedAt: Date.now() };
}
