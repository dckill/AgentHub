/**
 * Global configuration for AgentHub CLI
 * 
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import packageJson from '../package.json'

function isTrustedCachedToolExecutable(filePath: string, toolsRoot: string): boolean {
  const relativePath = relative(toolsRoot, filePath)
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return false
  const parts = relativePath.split(sep)
  if (parts.length !== 4 || parts[2] !== 'unpacked') return false
  return ['difft', 'rg', 'difft.exe', 'rg.exe'].includes(parts[3])
}

function hardenPrivateTree(root: string, toolsRoot: string): void {
  let stats;
  try { stats = lstatSync(root); } catch { return; }
  if (stats.isSymbolicLink()) return;
  if (stats.isDirectory()) {
    chmodSync(root, 0o700);
    for (const entry of readdirSync(root)) hardenPrivateTree(join(root, entry), toolsRoot);
  } else if (stats.isFile()) {
    chmodSync(root, isTrustedCachedToolExecutable(root, toolsRoot) ? 0o700 : 0o600);
  }
}

class Configuration {
  public readonly serverUrl: string
  public readonly isDaemonProcess: boolean

  // Directories and paths (from persistence)
  public readonly agentHubHomeDir: string
  public readonly logsDir: string
  public readonly settingsFile: string
  public readonly privateKeyFile: string
  public readonly daemonStateFile: string
  public readonly daemonLockFile: string
  public readonly sessionsFile: string
  public readonly currentCliVersion: string

  public readonly isExperimentalEnabled: boolean
  public readonly disableCaffeinate: boolean

  constructor() {
    // Server configuration - priority: environment > default
    // Configure via AGENTHUB_SERVER_URL in .env or environment
    this.serverUrl = process.env.AGENTHUB_SERVER_URL || 'https://agenthub.yzsd.asia:8443' // cspell:disable-line

    // Check if we're running as daemon based on process args
    const args = process.argv.slice(2)
    this.isDaemonProcess = args.length >= 2 && args[0] === 'daemon' && (args[1] === 'start-sync')

    // Directory configuration - Priority: AGENTHUB_HOME_DIR env > default home dir
    if (process.env.AGENTHUB_HOME_DIR) {
      // Expand ~ to home directory if present
      const expandedPath = process.env.AGENTHUB_HOME_DIR.replace(/^~/, homedir())
      this.agentHubHomeDir = expandedPath
    } else {
      this.agentHubHomeDir = join(homedir(), '.agenthub')
    }

    this.logsDir = join(this.agentHubHomeDir, 'logs')
    this.settingsFile = join(this.agentHubHomeDir, 'settings.json')
    this.privateKeyFile = join(this.agentHubHomeDir, 'access.key')
    this.daemonStateFile = join(this.agentHubHomeDir, 'daemon.state.json')
    this.daemonLockFile = join(this.agentHubHomeDir, 'daemon.state.json.lock')
    this.sessionsFile = join(this.agentHubHomeDir, 'sessions.json')

    this.isExperimentalEnabled = ['true', '1', 'yes'].includes(process.env.AGENTHUB_EXPERIMENTAL?.toLowerCase() || '');
    this.disableCaffeinate = ['true', '1', 'yes'].includes(process.env.AGENTHUB_DISABLE_CAFFEINATE?.toLowerCase() || '');

    this.currentCliVersion = packageJson.version

    // Visual indicator on CLI startup (only if not daemon process to avoid log clutter)
    const variant = process.env.AGENTHUB_VARIANT || 'stable'
    if (!this.isDaemonProcess && variant === 'dev') {
      console.log('\x1b[33m🔧 DEV MODE\x1b[0m - Data: ' + this.agentHubHomeDir)
    }

    if (!existsSync(this.agentHubHomeDir)) {
      mkdirSync(this.agentHubHomeDir, { recursive: true, mode: 0o700 })
    }
    // Ensure directories exist
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true, mode: 0o700 })
    }
    hardenPrivateTree(this.agentHubHomeDir, join(this.agentHubHomeDir, 'tools'))
  }
}

export const configuration: Configuration = new Configuration()
