import os from 'os';

import type { MachineMetadata } from '@/api/types';
import { configuration } from '@/configuration';
import { detectCLIAvailability } from '@/utils/detectCLI';
import { detectLocalCredentials } from '@/utils/detectLocalCredentials';
import { getEnvironmentInfo } from '@/ui/doctor';
import { projectPath } from '@/projectPath';
import { detectResumeSupport } from '@/resume/localAgentHubAgentAuth';
import packageJson from '../../package.json';

const hostSuffix = process.env.AGENTHUB_VARIANT === 'dev' ? '-dev' : '';

export const initialMachineMetadata: MachineMetadata = {
  host: os.hostname() + hostSuffix,
  platform: os.platform(),
  agentHubCliVersion: packageJson.version,
  homeDir: os.homedir(),
  agentHubHomeDir: configuration.agentHubHomeDir,
  agentHubLibDir: projectPath(),
  cliAvailability: detectCLIAvailability(),
  resumeSupport: { ...detectResumeSupport(), rpcAvailable: true },
  localCredentialStatus: detectLocalCredentials(),
};

export { getEnvironmentInfo };
