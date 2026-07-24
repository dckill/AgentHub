import chalk from 'chalk';
import { readCredentials } from '@/persistence';
import { ApiClient } from '@/api/api';
import { authenticateCodex } from './connect/authenticateCodex';
import { authenticateClaude } from './connect/authenticateClaude';
import { decodeJwtPayload } from './connect/utils';

/**
 * Handle connect subcommand
 * 
 * Implements connect subcommands for storing AI vendor API keys:
 * - connect codex: Store OpenAI API key in AgentHub cloud
 * - connect claude: Store Anthropic API key in AgentHub cloud
 * - connect help: Show help for connect command
 */
export async function handleConnectCommand(args: string[]): Promise<void> {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showConnectHelp();
        return;
    }

    switch (subcommand.toLowerCase()) {
        case 'codex':
            await handleConnectVendor('codex', 'OpenAI');
            break;
        case 'claude':
            await handleConnectVendor('claude', 'Anthropic');
            break;
        case 'status':
            await handleConnectStatus();
            break;
        default:
            console.error(chalk.red(`Unknown connect target: ${subcommand}`));
            showConnectHelp();
            process.exit(1);
    }
}

function showConnectHelp(): void {
    console.log(`
${chalk.bold('agenthub connect')} - Connect AI vendor API keys to AgentHub cloud

${chalk.bold('Usage:')}
  agenthub connect codex        Store your Codex API key in AgentHub cloud
  agenthub connect claude       Store your Anthropic API key in AgentHub cloud
  agenthub connect status       Show connection status for all vendors
  agenthub connect help         Show this help message

${chalk.bold('Compatibility alias:')}
  agenthub connect codex

${chalk.bold('Description:')}
  The connect command allows you to securely store your AI vendor API keys
  in AgentHub cloud. This enables you to use these services through AgentHub
  without exposing your API keys locally.

${chalk.bold('Examples:')}
  agenthub connect codex
  agenthub connect claude
  agenthub connect status

${chalk.bold('Notes:')} 
  • You must be authenticated with AgentHub first (run 'agenthub auth login')
  • API keys are encrypted and stored securely in AgentHub cloud
  • You can manage your stored keys in the AgentHub dashboard
`);
}

async function handleConnectVendor(vendor: 'codex' | 'claude', displayName: string): Promise<void> {
    console.log(chalk.bold(`\nConnecting ${displayName} to AgentHub cloud\n`));

    // Check if authenticated
    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('Not authenticated with AgentHub'));
        console.log(chalk.gray('  Please run "agenthub auth login" first'));
        process.exit(1);
    }

    // Create API client
    const api = await ApiClient.create(credentials);

    // Handle vendor authentication
    if (vendor === 'codex') {
        console.log('🚀 Registering Codex token with server');
        const codexAuthTokens = await authenticateCodex();
        await api.registerVendorToken('openai', { oauth: codexAuthTokens });
        console.log('✅ Codex token registered with server');
        process.exit(0);
    } else if (vendor === 'claude') {
        console.log('🚀 Registering Anthropic token with server');
        const anthropicAuthTokens = await authenticateClaude();
        await api.registerVendorToken('anthropic', { oauth: anthropicAuthTokens });
        console.log('✅ Anthropic token registered with server');
        process.exit(0);
    } else {
        throw new Error(`Unsupported vendor: ${vendor}`);
    }
}

/**
 * Show connection status for all vendors
 */
async function handleConnectStatus(): Promise<void> {
    console.log(chalk.bold('\n🔌 Connection Status\n'));

    // Check if authenticated
    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('Not authenticated with AgentHub'));
        console.log(chalk.gray('  Please run "agenthub auth login" first'));
        process.exit(1);
    }

    // Create API client
    const api = await ApiClient.create(credentials);

    // Check each vendor
    const vendors: Array<{ key: 'openai' | 'anthropic'; name: string; display: string }> = [
        { key: 'openai', name: 'Codex', display: 'OpenAI Codex' },
        { key: 'anthropic', name: 'Claude', display: 'Anthropic Claude' },
    ];

    for (const vendor of vendors) {
        try {
            const token = await api.getVendorToken(vendor.key);
            
            if (token?.oauth) {
                // Try to extract user info from id_token (JWT)
                let userInfo = '';
                
                if (token.oauth.id_token) {
                    const payload = decodeJwtPayload(token.oauth.id_token);
                    if (payload?.email) {
                        userInfo = chalk.gray(` (${payload.email})`);
                    }
                }
                
                // Check if token might be expired
                const expiresAt = token.oauth.expires_at || (token.oauth.expires_in ? Date.now() + token.oauth.expires_in * 1000 : null);
                const isExpired = expiresAt && expiresAt < Date.now();
                
                if (isExpired) {
                    console.log(`  ${chalk.yellow('⚠️')}  ${vendor.display}: ${chalk.yellow('expired')}${userInfo}`);
                } else {
                    console.log(`  ${chalk.green('✓')}  ${vendor.display}: ${chalk.green('connected')}${userInfo}`);
                }
            } else {
                console.log(`  ${chalk.gray('○')}  ${vendor.display}: ${chalk.gray('not connected')}`);
            }
        } catch {
            console.log(`  ${chalk.gray('○')}  ${vendor.display}: ${chalk.gray('not connected')}`);
        }
    }

    console.log('');
    console.log(chalk.gray('To connect a vendor, run: agenthub connect <vendor>'));
    console.log(chalk.gray('Example: agenthub connect codex'));
    console.log('');
}
