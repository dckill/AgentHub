# Session Workbench Validation - 2026-07-07

## Environment

- Branch: `codex/session-workbench-refactor`
- Authenticated environment: existing `gentle-comet`
- Web URL: `http://localhost:19007`
- Note: `pnpm env:up:authenticated` could not create a new environment because port `19007` was already occupied by the existing authenticated Expo Web service, so validation reused that running environment.

## Commands

- `npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionWorkbench.test.ts sources/sync/storageProjection.test.ts sources/sync/sessionUpdateGuards.test.ts sources/sync/officialArchiveSync.test.ts sources/components/connectOfficialCodexSession.test.ts sources/components/sessionRowActions.test.ts`
- `npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run src/api/apiMachine.officialSessions.test.ts src/codex/codexAppServerClient.test.ts src/codex/routeCodexUserMessage.test.ts src/claude/officialMirrorTakeover.test.ts src/claude/claudeShutdown.test.ts src/codex/titleInstruction.test.ts src/codex/officialSessions.test.ts src/claude/officialSessions.test.ts`
- `npx -y pnpm@10.11.0 --filter agenthub-app typecheck`
- `npx -y pnpm@10.11.0 --filter @artsum/agenthub typecheck`
- `npx -y pnpm@10.11.0 run format:check`
- `npx -y pnpm@10.11.0 run env:up:authenticated`
- `agent-browser` desktop and mobile checks against the authenticated Web app.

## Web Checks

- Desktop empty workbench renders without active sessions.
- Mobile empty workbench renders without obvious overlap.
- Created a minimal Codex validation session from the authenticated Web UI.
- Session list shows the AgentHub task row and a folded `Computer sessions` candidate section.
- Candidate section is capped to 5 recent computer sessions; a broad home-directory project no longer shows 49 candidates in the workbench.
- Official candidate discovery now uses exact project-root matching. A candidate whose `cwd` is a child directory is excluded by App projection tests and machine RPC filtering tests.
- Expanded candidate rows show `Take over` and candidate overflow shows `Move out of workspace`; no `official-codex`, `official-claude`, `mirror`, or `provider` labels were visible in the workbench.
- The expanded candidate list did not expose old child-project path text such as `/home/example/workspace` or `livebridge` in the authenticated Web validation.
- Mobile expanded candidate rows keep long titles inside the title area and keep the `Take over` pill separate from the title text.
- Mobile row quick actions show `Move out of workspace`; old default labels `Archive` and `Hide` were not shown for the session row action.
- Session info page separates `Move out of workspace` under `QUICK ACTIONS` from `Permanently delete session` under `DANGER ZONE`.
- Mobile session info path opened from the row action menu and showed the same action split.

## Screenshots

- Desktop expanded candidate section: `/tmp/session-workbench-root-exact.png`
- Mobile expanded candidate section after long-title layout fix: `/tmp/session-workbench-root-exact-mobile-fixed.png`

## Console Notes

Only development-mode Web warnings were observed:

- React DevTools suggestion.
- Expo Notifications unavailable on Web.
- Deprecated `pointerEvents`, `shadow*`, and Web animation fallback warnings.

No new page error was observed during the validated flow.
