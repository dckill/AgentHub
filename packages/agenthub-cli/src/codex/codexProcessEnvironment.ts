const CODEX_ROLLOUT_LOG_FILTER = 'codex_core::rollout::list=off';

export type CodexProcessEnvironmentParams = {
    base: NodeJS.ProcessEnv;
    overrides?: Record<string, string>;
    sandboxEnabled: boolean;
};

/** Build the filtered Codex child environment without mutating process.env. */
export function buildCodexProcessEnvironment(
    params: CodexProcessEnvironmentParams,
): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(params.base)) {
        if (typeof value === 'string') {
            env[key] = value;
        }
    }
    Object.assign(env, params.overrides ?? {});

    if (!env.RUST_LOG) {
        env.RUST_LOG = CODEX_ROLLOUT_LOG_FILTER;
    } else if (!env.RUST_LOG.includes('codex_core::rollout::list=')) {
        env.RUST_LOG += `,${CODEX_ROLLOUT_LOG_FILTER}`;
    }
    if (params.sandboxEnabled) {
        env.CODEX_SANDBOX = 'seatbelt';
    }
    return env;
}
