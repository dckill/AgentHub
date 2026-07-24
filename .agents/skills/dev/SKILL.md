---
name: dev
description: >
  Local development guide for the AgentHub monorepo. How to build, install,
  test, and run the CLI, server, mobile app, and desktop (Tauri) locally.
  Use when the user types /dev, asks how to "build", "start dev", "install
  locally", or "run the ___ package".
---

# /dev - Local Development

AgentHub is a pnpm monorepo. Everything uses pnpm workspaces — do not use `npm` or `yarn` directly.

## First-time setup

```bash
npx -y pnpm@10.11.0 install                       # installs deps for every package
npx -y pnpm@10.11.0 --filter @artsum/agenthub cli:install    # builds agenthub-cli + links it as the global `agenthub` binary
```

`cli:install` replaces whatever `agenthub` is on your PATH (npm-installed or not) with a symlink to `packages/agenthub-cli/`. Uses `~/.agenthub/` — same as production. On Linux machines with `agenthub-daemon.service`, prefer stopping the service before rebuilding and starting it afterward, instead of leaving a manual daemon running.

To undo: `npm unlink -g agenthub && npm i -g @artsum/agenthub@latest`.

## Packages

    packages/agenthub-cli     # the `agenthub` CLI and daemon, published to npm
    packages/agenthub-server  # Node + Prisma server; local hardening is verified independently of remote CI
    packages/agenthub-app     # Expo app: iOS, Android, web, Tauri desktop
    packages/agenthub-agent   # agent runtime
    packages/agenthub-wire    # shared Zod schemas + wire types

## agenthub-cli

    packages/agenthub-cli
    scripts in package.json:
      typecheck      # tsc --noEmit
      build          # rm -rf dist && tsc --noEmit && pkgroll
      test           # build + vitest run
      cli:install    # build + global link; use systemd restart flow for long-lived Linux daemon
      prepublishOnly # pnpm test (runs build inside test)
      postinstall    # pre-unpacks difft + rg into package tools/unpacked when lifecycle scripts are allowed

Work loop:

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub cli:install   # rebuild + relink
agenthub daemon status               # confirm your build is running
agenthub doctor                      # list all agenthub processes
tail -f ~/.agenthub/logs/$(ls -t ~/.agenthub/logs/ | head -1)
```

Linux systemd-managed daemon work loop:

```bash
systemctl --user stop agenthub-daemon.service
npx -y pnpm@10.11.0 --filter @artsum/agenthub build
systemctl --user start agenthub-daemon.service
systemctl --user status agenthub-daemon.service --no-pager
agenthub daemon status
agenthub daemon list
```

`agenthub-daemon.service` must contain `KillMode=process`. Daemon bundle replacement under systemd exits as failure and relies on `Restart=on-failure`; non-systemd daemon uses the self-spawn restart path.

Run a single test file quickly:

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run src/path/to/file.test.ts
```

Unit-only (fast, ~1 min):

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run --project unit
```

Integration tests hit real APIs, so run them on demand during local development. Missing local credentials or infrastructure must be reported as external/manual coverage rather than a passing skip. Remote GitLab jobs are outside the current hardening completion target; existing release policy remains documented in `/release`.

### Dev data sandbox (optional)

`agenthub` reads `AGENTHUB_HOME_DIR` to override `~/.agenthub/`. To run two versions side-by-side without touching your prod auth:

```bash
AGENTHUB_HOME_DIR=~/.agenthub-dev agenthub daemon start
AGENTHUB_HOME_DIR=~/.agenthub-dev agenthub auth
```

Point at a local server the same way:

```bash
AGENTHUB_SERVER_URL=http://localhost:13017 agenthub daemon start
```

## agenthub-server

```bash
npx -y pnpm@10.11.0 --filter agenthub-server standalone:dev   # localhost:13017, embedded PGlite, no Docker
```

App auto-reloads on source changes. Point the CLI or the Expo app at it with `AGENTHUB_SERVER_URL=http://localhost:13017` / `EXPO_PUBLIC_AGENTHUB_SERVER_URL=...`.

## agenthub-app (Expo)

```bash
npx -y pnpm@10.11.0 --filter agenthub-app start           # expo start (Metro bundler)
npx -y pnpm@10.11.0 --filter agenthub-app ios:dev         # iOS simulator, development variant
npx -y pnpm@10.11.0 --filter agenthub-app android:dev
npx -y pnpm@10.11.0 --filter agenthub-app web             # web build, served locally
npx -y pnpm@10.11.0 --filter agenthub-app tauri:dev       # macOS desktop app
```

Variants:

    development    com.artsum.agenthub.dev       # hot reload, internal
    preview        com.artsum.agenthub.preview   # OTA / beta testing
    production     com.artsum.agenthub           # App Store

## agenthub-app-logs (remote log receiver)

```bash
npx -y pnpm@10.11.0 --filter agenthub-app-logs dev       # starts on http://0.0.0.0:8787
```

Receives POST requests to `/logs` from the mobile app's patched console (see `consoleLogging.ts`).
Logs to stdout and `~/.agenthub/app-logs/<timestamp>.log`.

To connect: set the log server URL in the app's dev settings to `http://<LAN_IP>:8787`.
The app's `consoleLogging.ts` sends all console.log/warn/error to this endpoint when configured.

Console output must be enabled in the app (dev/preview variants default on, production defaults off,
togglable from the dev settings screen).

## Cross-cutting

Authenticated Web state tests may use the isolated environment manager:

```bash
npx -y pnpm@10.11.0 run env:up:authenticated
```

The manager defaults Expo Web to `EXPO_UNSTABLE_HEADLESS=true`, waits up to 120 seconds for a cold Web start (override with `AGENTHUB_ENV_WEB_STARTUP_TIMEOUT_MS`), and reuses a `pnpm` executable already on `PATH` before falling back to the pinned `npx` invocation. Web credentials are memory-only; refresh/close requires a new authenticated URL. Required UI verification is browser-free (`pnpm web:contract:test`, component/state/accessibility tests, typecheck, and production build). Only start a browser when the user explicitly requests visual acceptance; then run `pnpm env:down` and `pnpm env:remove <name>` and confirm no Chrome/Expo orphan processes remain.

- **Root development install:** the workspace uses an isolated, no-hoist layout with strict peer dependencies and no automatic peer installation. Every package must declare what it imports; do not rely on root-visible transitive dependencies. Production Server installs use the same frozen dependency-boundary principle. Provider tooling is limited to Claude Code and Codex.
- **Workspace deps:** `"@artsum/agenthub-wire": "workspace:*"` resolves to `packages/agenthub-wire/` — edits are picked up live.
- **`$npm_execpath`:** legacy; agenthub-cli uses `pnpm` literally. Windows cmd.exe doesn't expand `$VAR`.
- **Build before tests:** tests spawn the built CLI binary (for daemon integration), so `pnpm test` runs `build` first. Do not remove.

## Releasing

Do not publish by hand. Use `/release` for the selected component's publish, tag, deployment and smoke-check workflow. Remote CI evidence belongs to release operations, not to the local hardening goal's completion criteria.

## Troubleshooting

    agenthub: command not found     → npx -y pnpm@10.11.0 --filter @artsum/agenthub cli:install
    daemon won't start           → systemctl --user status agenthub-daemon.service --no-pager; agenthub daemon status; agenthub doctor
    stuck thinking after update  → verify KillMode=process, restart agenthub-daemon.service, then run agenthub doctor clean only if stale processes remain
    wrong `agenthub` version        → which agenthub && ls -la $(which agenthub) — confirms where it resolves to
    bundled tools missing        → run `agenthub --version`; it validates package tools or atomically prepares the versioned 0700 cache under `$AGENTHUB_HOME_DIR/tools/`
    stale deps after branch swap → pnpm install (pnpm is picky about lockfile drift)

## Rules

- Never use `npm install` or `yarn install` — only pnpm.
- Never add a `dev` / `cli` tsx-based script back to agenthub-cli. The build step is not optional — daemon spawns the built binary and would desync.
- Never bring back `release-it`. Releases go through `/release`.
- Never introduce `~/.agenthub-dev` as a default. It exists as an opt-in via `AGENTHUB_HOME_DIR`, nothing more.
