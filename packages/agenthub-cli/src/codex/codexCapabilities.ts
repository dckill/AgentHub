export type CodexVersion = {
  major: number;
  minor: number;
  patch: number;
};

export type CodexCapabilities = {
  version: CodexVersion | null;
  appServer: boolean;
  goalActions: boolean;
};

const CODEX_VERSION_PATTERN = /codex-cli\s+(\d+)\.(\d+)\.(\d+)/;

function parseCodexVersion(versionOutput: string): CodexVersion | null {
  const match = versionOutput.match(CODEX_VERSION_PATTERN);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function meetsMinimumMinor(version: CodexVersion | null, minimumMinor: number): boolean {
  return version !== null && (version.major > 0 || version.minor >= minimumMinor);
}

export function getCodexCapabilities(versionOutput: string): CodexCapabilities {
  const version = parseCodexVersion(versionOutput);
  return {
    version,
    appServer: meetsMinimumMinor(version, 100),
    goalActions: meetsMinimumMinor(version, 140),
  };
}

export function isCodexAppServerAvailable(versionOutput: string): boolean {
  return getCodexCapabilities(versionOutput).appServer;
}

export function isCodexGoalActionsAvailable(versionOutput: string): boolean {
  return getCodexCapabilities(versionOutput).goalActions;
}
