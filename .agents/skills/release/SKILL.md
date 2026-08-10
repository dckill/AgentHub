---
name: release
description: >
  Release pipeline for CLI, mobile, web, and server. Guides through version
  bumping, building, testing, publishing, and deploying. Replaces the old
  interactive release-it flow with a Claude Code-native experience.
  Use when user types /release or asks to release, publish, deploy, or ship
  any component.
---

# Release

You are the release operator for the AgentHub monorepo. When invoked, walk the user through releasing the component they choose.

Scope note: protected GitLab/OIDC/artifact checks below describe production release operations. They are not completion criteria for the local security/performance/UX hardening goal, and this skill must not expand that goal into CI development work.

## Step 1: Pick a target

Ask which component to release:

- **CLI** — npm package `@artsum/agenthub` (binary `agenthub`)
- **Mobile** — Expo/EAS builds for iOS + Android
- **Web** — Docker image + digest renderer + Kubernetes deploy through protected GitLab/master
- **Server** — Docker image + digest renderer + Kubernetes deploy through protected GitLab/master
- **Docs** — self-hosted documentation from this repository's `docs/`

Present these as options. Wait for the user to pick.

---

## CLI Release

    Package:     packages/agenthub-cli
    npm name:    @artsum/agenthub
    Registry:    https://registry.npmjs.org
    Git tags:    cli-{version}

Tag namespace note:
- CLI releases use `cli-X.Y.Z`
- Native releases use `native-<runtime-version>`
- OTA releases use `ota-<ota-version>`
- Do not use a bare `vX.Y.Z` tag for AgentHub releases because multiple release streams coexist in this repo

### Step 2: Gather state

Run these in parallel:
1. `npm view @artsum/agenthub dist-tags` — see current latest + beta
2. `cat packages/agenthub-cli/package.json | grep version` — local version
3. `git status --short` — check for dirty state
4. `git branch --show-current` — confirm branch
5. `git log --oneline -10` — recent commits for release notes context

Present a summary:
```
Local version:  X.Y.Z
npm latest:     X.Y.Z
npm beta:       X.Y.Z-N
Branch:         master
Working tree:   clean / dirty
```

### Step 3: Pick channel and version

Ask the user:
- **Channel**: `latest` or `beta`
- **Bump type**: For latest: `patch`, `minor`, `major`. For beta: `prerelease` (appends `-N`), or explicit version.

Suggest a sensible default based on the current state. For beta, the next prerelease of the current version. For latest, a patch bump.

Present as options. Wait for confirmation.

### Step 4: Version bump

Edit `packages/agenthub-cli/package.json` directly — do NOT use `npm version` (it chokes on pnpm workspace protocol).

IMPORTANT: do this **before** build/test for the CLI. The build imports `package.json` and bakes the version into the generated bundle. If you build first and bump later, `agenthub --version` can still report the old prerelease version even though npm metadata shows the new one.

### Step 5: Build

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub build
```

Report success/failure. Stop on failure.

### Step 6: Test (unit only)

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run --project unit
```

Integration tests are slow and flaky — skip them for releases. Unit tests are the gate.
Expect the unit suite to take around a minute; `src/utils/serverConnectionErrors.test.ts` is particularly slow, so don't mistake a long run for a hang.

Report results. If failures, ask the user whether to proceed or abort.

### Step 7: Publish

```bash
cd packages/agenthub-cli
pnpm publish --tag {channel} --no-git-checks --ignore-scripts
```

- `--no-git-checks`: allows dirty working tree (we already verified state)
- `--ignore-scripts`: skips `prepublishOnly` (we already built and tested)

### Step 8: Verify

```bash
npm view @artsum/agenthub dist-tags
```

Confirm the new version appears under the correct tag.
If `latest` doesn't move immediately, wait 10-15 seconds and check again; npm tag propagation is not always instant.

### Step 9: Git tag + commit (latest only)

For `latest` releases only:
1. Commit the version bump: `Release version X.Y.Z`
2. Tag: `git tag cli-X.Y.Z`
3. Push: `git push && git push --tags`

For `beta` releases: ask the user if they want to commit the version bump or leave it uncommitted.

If `git push` is rejected because `origin/master` advanced while releasing, fetch and rebase the release commit before retrying:
```bash
git fetch origin master
git rebase --autostash origin/master
git tag -f cli-X.Y.Z
git push && git push --tags
```

Use `--autostash` when the worktree is dirty from unrelated local changes so those edits are preserved. Recreate the tag after rebase because the release commit hash changes.

### Step 10: GitLab Release (latest only)

For `latest` releases, create a GitLab release only after the protected master pipeline succeeds:
```bash
glab release create cli-X.Y.Z --name "cli-X.Y.Z" --notes "AgentHub CLI X.Y.Z"
```

### Step 11: Install + verify locally

```bash
npm i -g @artsum/agenthub@{channel}
agenthub --version
agenthub daemon status
```

Report the installed version and daemon status.
The smoke check must confirm that `agenthub --version` matches the published version, not just npm metadata. If it reports the old version, rebuild after the version bump and cut a corrective patch release.

---

## Mobile Release

    Package:     packages/agenthub-app
    Variants:    development, preview, production
    Platform:    Expo SDK 55 / React Native 0.83
    Runtime:     1

### Build types

**Always ask the user explicitly what they want to release.** Present these
options in order of popularity:

1. **OTA update (preview)** — push JS bundle to preview channel. Most common release type.
2. **OTA update (production)** — push JS bundle to production channel. Do this after preview OTA is validated.
3. **Native dev build** — when native code changes. Points to dev server with bundled app.
4. **Full native release** — build all profiles (dev + preview + production) to prep for a new native release.

#### OTA Updates

  ```bash
  # Preview (most common)
  pnpm --filter agenthub-app run ota

  # Production
  pnpm --filter agenthub-app run ota:production
  ```

Production Android OTA must be exported locally and published directly. Never use
`eas workflow:run` for routine OTA releases because it uploads a compressed copy of
the whole repository before running the update job. Set `OTA_MESSAGE` when using the
package script, or run the underlying command directly:
  ```bash
  cd packages/agenthub-app && EAS_SKIP_AUTO_FINGERPRINT=1 APP_ENV=production NODE_ENV=production \
    EXPO_PUBLIC_AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443 \
    npx eas-cli@latest update --channel production --environment production \
    --platform android --message "<message>" --non-interactive
  ```

Keep Expo SDK 55 bsdiff support enabled in both app config and the checked-in Android
manifest. Existing binaries without the native flag require one native APK upgrade;
after that, JS and asset-only changes remain OTA updates.

#### Native Builds

- **Dev build** — development profile, used when native code changes (points to dev server)
  ```bash
  cd packages/agenthub-app && eas build --profile development --platform all --non-interactive
  ```

- **TestFlight / Play Store builds** — use `-store` profiles for distribution via TestFlight and Play Store.
  **Always pass `--auto-submit`** so the build goes straight to TestFlight after completion.
  ```bash
  # Preview (TestFlight/internal testing)
  cd packages/agenthub-app && eas build --profile preview-store --platform ios --non-interactive --auto-submit

  # Dev (TestFlight, points to dev server)
  cd packages/agenthub-app && eas build --profile development-store --platform ios --non-interactive --auto-submit

  # Production (App Store / Play Store submission)
  cd packages/agenthub-app && eas build --profile production --platform ios --non-interactive --auto-submit
  ```

**IMPORTANT:** Always pass `--non-interactive` to `eas build` commands. Without it,
EAS prompts for Apple account login interactively which breaks in non-TTY contexts
(Claude Code, CI). Remote credentials are already configured on EAS servers.

**IMPORTANT:** Always pass `--auto-submit` to `-store` builds. Without it, the build
finishes but never reaches TestFlight — you have to manually submit with `eas submit`.

### EAS Build Profiles

    Profile              Distribution   Channel       Notes
    development-store    store          development   Dev build via TestFlight
    preview-store        store          preview       TestFlight / Play Store internal testing
    production           store          production    App Store / Play Store submission

---

#### Internal / ad-hoc profiles (rarely used)

These install via direct link, NOT TestFlight. Almost never needed — prefer
the `-store` profiles above.

    Profile              Distribution   Channel
    development          internal       development
    preview              internal       preview

Version source is remote (EAS manages build numbers, auto-incremented).
Current runtime version is "1" — bump only when native code changes require invalidating existing OTA clients.

### Local Android preview APK

For personal Android install testing, use the repository script so artifacts are copied to the root `artifacts/` directory:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app android:preview:apk:arm64
```

Expected outputs:
- `artifacts/agenthub-preview-arm64-YYYYMMDD-HHMM.apk`
- `artifacts/agenthub-preview-arm64-latest.apk`

### App Store Connect

Apple ID、Team ID、App Store Connect App ID 和签名凭据属于维护者私有发布
配置，不得写入仓库。通过 EAS credentials、App Store Connect 或受保护的发布
环境配置它们；公开仓库只保留以下非敏感的 bundle identifier 与构建 profile：

- Production：`com.artsum.agenthub`
- Preview：`com.artsum.agenthub.preview`
- Development：`com.artsum.agenthub.dev`

---

## Web Release

    Package:     packages/agenthub-app (same Expo app, web export)
    Dockerfile:  Dockerfile.webapp
    Image:       <registry>/<namespace>/agenthub-app@sha256:<digest>
    K8s:         packages/agenthub-app/deploy/agenthub-app.yaml (3 replicas)

Web release readiness is defined in the repository and enforced by the protected GitLab `master` pipeline. Do not treat a local export or mutable image tag as a production release.

Flow: `expo export --platform web` -> nginx:alpine static serve -> Docker build -> push -> K8s deploy.

Public build args: `POSTHOG_PUBLIC_VALUE`, `REVENUE_CAT_PUBLIC_VALUE`. Never pass a server secret as a Docker build arg.

After building, scanning, generating SBOM/provenance, signing and pushing the image, resolve the registry digest and use the signed release orchestrator. Omit `--apply` for the verification-only pass; add it only in the protected manual deploy job:

```bash
node scripts/runSignedKubernetesRelease.cjs \
  --component web \
  --image <registry>/<namespace>/agenthub-app@sha256:<digest> \
  --registry-prefix <registry>/<namespace> \
  --certificate-identity <gitlab-project-url>//.gitlab-ci.yml@refs/heads/master \
  --certificate-issuer <gitlab-server-origin> \
  --namespace agenthub-production \
  --manifest-output /tmp/agenthub-web-production.yaml \
  --policy-output /tmp/agenthub-signature-policy.yaml \
  --report-output /tmp/agenthub-web-release.json \
  --timeout 120s
```

The protected cluster must have the immutable CEL policy, Sigstore Policy Controller with Cosign v3 bundle support, External Secrets stable `external-secrets.io/v1`, and a namespace `SecretStore/vault-backend`. Vault key `/agenthub-registry` property `dockerconfigjson` must render `Secret/agenthub-registry` as type `kubernetes.io/dockerconfigjson`. The orchestrator verifies the exact protected-master keyless signature before mutation, waits for both signature policies and the ExternalSecret to become Ready, verifies the generated Secret type, performs a server-side workload dry-run, then applies and waits for readiness. A failed rollout is undone and must return to the exact previous digest; a failed initial rollout is removed. Obtain explicit confirmation before any registry push or cluster mutation.

---

## Server Release

    Package:     packages/agenthub-server
    Dockerfile:  Dockerfile.server (runner + migration targets), Dockerfile (standalone w/ PGlite)
    Images:      <registry>/<namespace>/agenthub-server@sha256:<digest>
                 <registry>/<namespace>/agenthub-server-migration@sha256:<digest>
    K8s:         packages/agenthub-server/deploy/base/agenthub.yaml (port 13017)

Server release readiness is defined in the repository and enforced by the protected GitLab `master` pipeline. The production manifest deliberately contains a zero-digest sentinel and must be rendered with the exact pushed image digest:

```bash
node scripts/renderKubernetesRelease.cjs --component server \
  --image <registry>/<namespace>/agenthub-server@sha256:<digest> \
  --output /tmp/agenthub-server-production.yaml
kubectl apply --server-side --dry-run=server -f /tmp/agenthub-server-production.yaml
```

The online Server image runs only compiled Node output with the independent `packages/agenthub-server-runtime/pnpm-lock.yaml`; it must not contain Prisma CLI/schema, TSX, TypeScript or test/frontend build tools. Build database migrations from the `migration` target as a distinct `agenthub-server-migration` image. Both digests require independent vulnerability/SBOM/provenance/signature evidence and the signature policy covers Server, migration and Web image names.

Runtime secrets remain external through the stable-v1 `agenthub-secrets` ExternalSecret; private registry credentials use the separate stable-v1 `agenthub-registry` ExternalSecret. Production deploys use `runSignedKubernetesRelease.cjs` with `--component server`, exact `/agenthub-server@sha256:` and `/agenthub-server-migration@sha256:` images, plus absolute migration manifest/log outputs. The orchestrator verifies both protected-master signatures before Kubernetes mutation, waits for both ExternalSecrets, creates a fresh hardened one-shot migration Job, waits for Complete and retains private logs before applying the Deployment. Migration failure deletes the Job and stops before online mutation. Require vulnerability/SBOM/provenance/signature verification, ExternalSecret readiness, migration success, rollout readiness and exact rollback evidence, then obtain explicit confirmation before any registry push or cluster mutation. Local contracts do not replace the first real protected job artifact.

---

## Docs Release

    Site:    Self-hosted documentation
    Repo:    This repository (docs/)

Documentation is maintained in the `docs/` directory of this repository.

---

## Rules

### Protected GitLab evidence

Before declaring Web, Server, or a `latest` CLI release ready, collect fail-closed evidence for the exact releasable commit. Inject exactly one token through the environment; never put its value in argv or logs:

```bash
CI_API_V4_URL=https://gitlab.example.com/api/v4 \
CI_PROJECT_PATH=group/agenthub \
CI_COMMIT_SHA=$(git rev-parse HEAD) \
GITLAB_TOKEN="$GITLAB_TOKEN" \
npx -y pnpm@10.11.0 gitlab:evidence
```

The collector derives required jobs and retained artifacts from `.gitlab-ci.yml`, follows every bounded GitLab API page and selects the latest retry for each job, requires protected `master`, an active `master` schedule, and a successful exact-SHA pipeline, then writes `reports/gitlab/release-evidence.json` atomically with private permissions. Missing authentication, protection, schedule, job success, or artifact evidence is a release failure; do not replace it with a local `ci:verify` result.

API requests default to a 15-second per-attempt timeout, three attempts for 429/502/503/504 only, a 250ms retry delay, no redirects, and a 2MiB streamed response limit. Protected CI may tune these with `GITLAB_EVIDENCE_TIMEOUT_MS`, `GITLAB_EVIDENCE_MAX_ATTEMPTS`, `GITLAB_EVIDENCE_RETRY_DELAY_MS`, and `GITLAB_EVIDENCE_MAX_RESPONSE_BYTES`; invalid or out-of-range values fail before authentication is sent.

For the exact SHA, the highest pipeline ID must itself be a successful `push` pipeline; an older success never overrides a newer failure. Every retained artifact must be non-empty and either have no expiry or expire after the evidence capture time.

The collector also derives every schedule-only integration switch from `.gitlab-ci.yml` and requires the active protected schedule to expose the exact values as environment variables. It records only the required variable names, never unrelated schedule variables or credential values.

Configuration alone is insufficient: the schedule's latest pipeline must be a successful `master` schedule pipeline, and every derived schedule-only required job must have its latest attempt succeed with `allow_failure=false`. Scheduled evidence artifacts must also remain non-empty and unexpired.

The latest scheduled pipeline must have a valid `updated_at` within 48 hours of evidence capture, allowing at most five minutes of future clock skew. Protected CI may set `GITLAB_EVIDENCE_SCHEDULE_MAX_AGE_HOURS` from 1 to 720 when the authoritative schedule cadence differs.

The API target must be a canonical HTTPS (or loopback HTTP) URL ending in `/api/v4`, without embedded credentials, query, fragment, malformed encoding, or traversal; the project must be a canonical namespace/project path. The evidence output path must not contain an existing symbolic-link ancestor or leaf. Run evidence collection only in a single-tenant protected workspace because same-user path-replacement races cannot be eliminated without an `openat`-style directory-fd writer.

When GitLab provides `CI_SERVER_URL`, the API scheme/host/port must match it exactly before any authentication header is used. Evidence output is resolved under `CI_PROJECT_DIR`; absolute or parent-relative paths that escape the project are rejected before the existing symbolic-link and private-permission checks.

Protected `master` must require a successful pipeline before merge and disable direct push for everyone. A role-level push grant or a user, group, or deploy-key exception is a release failure even when force-push is disabled.

Every GitLab default, job, and service container image must use an immutable `@sha256:<64 hex>` reference. The isolated registry release drill may retry a release install exactly once only after an explicit transient socket, DNS, or bounded timeout failure; integrity and registry-policy failures remain immediately fatal.

Dependency caches must be split across the protected/unprotected trust boundary: include `CI_COMMIT_REF_PROTECTED` in the cache-key prefix, keep lockfile content in the key, and set `cache.unprotect: false`. A protected release must never consume an unprotected pipeline cache.

The root `packageManager` descriptor must bind the pinned pnpm version to its exact published SHA-512 archive hash. GitLab and Docker builds must enable Corepack, set `COREPACK_DEFAULT_TO_LATEST=0`, and let the checked-in descriptor select pnpm; never bypass that hash with a version-only `corepack prepare` command.

All checked-in third-party Kubernetes workload images, including local development overlays, must use an explicit version plus multi-architecture manifest digest. Keep the canonical Server manifest inside `packages/agenthub-server/deploy/base/`; local Kustomize execution must use the default load restrictor and must never restore `LoadRestrictionsNone`.

- **Always present options** — never assume which component, channel, or version.
- **Always verify before publishing** — show the user what will be published and get confirmation.
- **Protected required CI is the release gate** — run the component unit/contract/build checks locally, then require the protected `master` pipeline; never skip or hide a failing integration/provider/platform gate.
- **Use the signed release orchestrator** — do not replace its keyless identity, bundle admission, ExternalSecret readiness/type or exact rollback checks with ad-hoc `kubectl apply` commands.
- **Use pnpm publish, not npm publish** — avoids workspace protocol issues.
- **Use --ignore-scripts** — we build and test explicitly, no need for prepublishOnly to redo it.
- **Never force-push tags** — if a tag exists, stop and ask.
