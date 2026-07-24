export const SUPPORTED_CLIENT_AGENTS = ['claude', 'codex'] as const;

export type SupportedClientAgent = typeof SUPPORTED_CLIENT_AGENTS[number];
export type LegacyClientAgent = 'gemini' | 'openclaw';
export type ClientAgent = SupportedClientAgent | LegacyClientAgent;

export const CLIENT_AGENT_LABELS: Record<SupportedClientAgent, string> = {
    claude: 'Claude Code',
    codex: 'Codex',
};

export function isSupportedClientAgent(agent: string | null | undefined): agent is SupportedClientAgent {
    return agent === 'claude' || agent === 'codex';
}

export function coerceSupportedClientAgent(agent: string | null | undefined): SupportedClientAgent {
    return isSupportedClientAgent(agent) ? agent : 'claude';
}
