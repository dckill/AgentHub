import type { CliUpdateStatus } from '@artsum/agenthub-wire';
import { CliUpdateManager } from '@/update/cliUpdater';
import { configuration } from '@/configuration';

function printStatus(status: CliUpdateStatus): void {
  console.log(`Current CLI: ${status.currentVersion}`);
  if (status.latestVersion) console.log(`Latest CLI:  ${status.latestVersion}`);
  if (status.targetVersion) console.log(`Target CLI:  ${status.targetVersion}`);
  console.log(`Status:      ${status.phase}`);
  if (status.error) console.log(`Error:       ${status.error}`);
  if (status.unsupportedReason) console.log(`Unavailable: ${status.unsupportedReason}`);
}

export async function handleUpdateCommand(args: string[]): Promise<void> {
  const manager = new CliUpdateManager({ currentVersion: configuration.currentCliVersion });
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`agenthub update

Usage:
  agenthub update --check             Check for a newer stable CLI
  agenthub update                     Install the latest stable CLI
  agenthub update --version <version> Install an exact CLI version
  agenthub update --rollback          Reinstall the recorded previous version`);
    return;
  }

  if (args.includes('--check')) {
    printStatus(await manager.check());
    return;
  }
  if (args.includes('--rollback')) {
    printStatus(await manager.rollback());
    return;
  }
  const versionIndex = args.indexOf('--version');
  const version = versionIndex >= 0 ? args[versionIndex + 1] : undefined;
  if (versionIndex >= 0 && !version) throw new Error('--version requires an exact semantic version');
  printStatus(await manager.apply(version));
}
