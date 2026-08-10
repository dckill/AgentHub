import { describe, expect, it } from 'vitest';
import { buildCodexProcessEnvironment } from './codexProcessEnvironment';

describe('buildCodexProcessEnvironment', () => {
    it('filters non-string values, applies overrides and enables sandbox', () => {
        expect(buildCodexProcessEnvironment({
            base: {
                PATH: '/usr/bin',
                RUST_LOG: 'codex_core=info',
                EMPTY: undefined,
            },
            overrides: { AGENTHUB_MODE: 'test' },
            sandboxEnabled: true,
        })).toEqual({
            PATH: '/usr/bin',
            RUST_LOG: 'codex_core=info,codex_core::rollout::list=off',
            AGENTHUB_MODE: 'test',
            CODEX_SANDBOX: 'seatbelt',
        });
    });

    it('does not duplicate the rollout filter when already configured', () => {
        expect(buildCodexProcessEnvironment({
            base: { RUST_LOG: 'codex_core::rollout::list=debug' },
            sandboxEnabled: false,
        })).toEqual({
            RUST_LOG: 'codex_core::rollout::list=debug',
        });
    });
});
