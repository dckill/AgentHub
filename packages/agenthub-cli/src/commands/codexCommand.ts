import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { runCodex } from '@/codex/runCodex'
import { extractCodexResumeFlag } from '@/codex/cliArgs'
import { extractNoSandboxFlag } from '@/utils/sandboxFlags'
import { ensureDaemonRunning } from '@/daemon/ensureDaemonRunning'
import type { PermissionMode } from '@/api/types'

const VALID_PERMISSION_MODES = new Set<PermissionMode>([
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'read-only',
  'safe-yolo',
  'yolo',
])

export async function handleCodexCommand(args: string[]): Promise<void> {
  let startedBy: 'daemon' | 'terminal' | undefined = undefined
  let initialPermissionMode: PermissionMode | undefined = undefined
  let initialModel: string | undefined = undefined
  const sandboxArgs = extractNoSandboxFlag(args)
  const codexArgs = extractCodexResumeFlag(sandboxArgs.args)

  for (let i = 0; i < codexArgs.args.length; i++) {
    const arg = codexArgs.args[i]
    if (arg === '--started-by') {
      startedBy = codexArgs.args[++i] as 'daemon' | 'terminal'
    } else if (arg === '--permission-mode') {
      const value = codexArgs.args[++i] as PermissionMode | undefined
      if (value && VALID_PERMISSION_MODES.has(value)) {
        initialPermissionMode = value
      }
    } else if (arg.startsWith('--permission-mode=')) {
      const value = arg.slice('--permission-mode='.length) as PermissionMode
      if (VALID_PERMISSION_MODES.has(value)) {
        initialPermissionMode = value
      }
    } else if (arg === '--model') {
      initialModel = codexArgs.args[++i]
    } else if (arg.startsWith('--model=')) {
      initialModel = arg.slice('--model='.length)
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded()
  if (startedBy !== 'daemon') {
    await ensureDaemonRunning()
  }

  await runCodex({
    credentials,
    startedBy,
    noSandbox: sandboxArgs.noSandbox,
    resumeThreadId: codexArgs.resumeThreadId ?? undefined,
    ...(initialPermissionMode ? { initialPermissionMode } : {}),
    ...(initialModel ? { initialModel } : {}),
  })
}
