import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = {
    serverUrl: string;
    homeDir: string;
    credentialPath: string;
};

export function loadConfig(): Config {
    // Configure via AGENTHUB_SERVER_URL in .env or environment
    const serverUrl = (process.env.AGENTHUB_SERVER_URL ?? 'https://agenthub.yzsd.asia:8443').replace(/\/+$/, ''); // cspell:disable-line
    const homeDir = process.env.AGENTHUB_HOME_DIR ?? join(homedir(), '.agenthub');
    const credentialPath = join(homeDir, 'agent.key');
    return { serverUrl, homeDir, credentialPath };
}
