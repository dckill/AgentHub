# AgentHub CLI Provider Tests

## Layer 1 Rules

- one primary integration test file per supported provider
- keep that file next to the agent code
- use 2-3 long integration tests per agent
- mocked tests do not count as acceptance
- do not build a generic layer-1 framework directory
- test the real agent surface directly

## Primary Files

- `packages/agenthub-cli/src/codex/codex.integration.test.ts`
- `packages/agenthub-cli/src/claude/claude.integration.test.ts`

If an agent has extra integration-style files, only one file is the primary
acceptance test. The rest are support checks.

## What Each Primary Test Must Cover

Every primary provider integration file must cover:

1. basic turn + multi-turn context
2. permissions + model switching + sandboxing
3. interrupt + stop + failure handling

If an agent does not support part of that surface, the test should assert the
real limitation directly.

## Test Shape

Keep it simple:

- one file per agent
- a few long tests
- real CLI
- real auth
- real permission flow
- real interruption

No mocks as the main proof.
