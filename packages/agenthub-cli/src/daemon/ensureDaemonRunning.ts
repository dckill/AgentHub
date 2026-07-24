import { logger } from '@/ui/logger'
import { checkIfDaemonRunningAndCleanupStaleState, isDaemonRunningCurrentlyInstalledAgentHubVersion } from './controlClient'
import { spawnAgentHubCLI } from '@/utils/spawnAgentHubCLI'
import { isSystemdDaemonInstalled, startSystemdDaemon } from './systemdSupervisor'

const DAEMON_READY_TIMEOUT_MS = 5000
const DAEMON_READY_POLL_INTERVAL_MS = 100

export async function ensureDaemonRunning(): Promise<void> {
  logger.debug('Ensuring AgentHub background service is running & matches our version...')

  if (await isDaemonRunningCurrentlyInstalledAgentHubVersion()) {
    return
  }

  logger.debug('Starting AgentHub background service...')

  if (isSystemdDaemonInstalled()) {
    try {
      await startSystemdDaemon()
    } catch (error) {
      // A provisioned systemd unit remains the sole owner of the daemon. Do
      // not fall back to a detached process, which would create two owners and
      // can orphan runner sessions when systemd later restarts its unit.
      logger.debug('Failed to start the installed systemd daemon service:', error)
    }
  } else {
    const daemonProcess = spawnAgentHubCLI(['daemon', 'start-sync'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    daemonProcess.unref()
  }

  // Wait for the spawned daemon to be fully ready: it must write daemon.state.json,
  // bind its HTTP port, and respond to a health ping. Without this, early callers
  // (e.g. notifyDaemonSessionStarted) race the daemon startup and the webhook is
  // silently lost — which later breaks resume-agenthub-session.
  const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await checkIfDaemonRunningAndCleanupStaleState()) {
      logger.debug('AgentHub background service is ready')
      return
    }
    await new Promise(resolve => setTimeout(resolve, DAEMON_READY_POLL_INTERVAL_MS))
  }

  logger.debug(`AgentHub background service did not become ready within ${DAEMON_READY_TIMEOUT_MS}ms; continuing anyway`)
}
