import fs from "node:fs";
import path from "node:path";

export type MetadataIssue = { code: string; message: string };

const root = path.resolve(__dirname, "..");

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextOrEmpty(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

export function checkPinnedDockerBaseImages(content: string): string[] {
  const declaredStages = new Set<string>();
  const unpinnedExternalImages: string[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(/^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$/i);
    if (!match) continue;

    const [, image, stageName] = match;
    if (!declaredStages.has(image.toLowerCase()) && !/@sha256:[0-9a-f]{64}$/i.test(image)) {
      unpinnedExternalImages.push(line);
    }
    if (stageName) declaredStages.add(stageName.toLowerCase());
  }

  return unpinnedExternalImages;
}

export function checkOperationalDocumentation(documents: {
  devSkill: string;
  releaseSkill: string;
  privacy: string;
}): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  const devSkillIsCurrent = [
    "com.artsum.agenthub.dev",
    "com.artsum.agenthub.preview",
    "com.artsum.agenthub",
    "Remote GitLab jobs are outside the current hardening completion target",
    "Remote CI evidence belongs to release operations",
  ].every((required) => documents.devSkill.includes(required))
    && !/TeamCity|GitHub releases|asia\.yzsd\.agenthub|Protected integration jobs remain required release gates/.test(documents.devSkill);
  if (!devSkillIsCurrent) {
    issues.push({
      code: "dev-skill-drift",
      message: "dev skill must use current App identifiers and keep remote CI outside the local hardening completion target",
    });
  }

  const releaseSkillIsCurrent = documents.releaseSkill.includes("protected GitLab")
    && documents.releaseSkill.includes("master")
    && [
      "com.artsum.agenthub.dev",
      "com.artsum.agenthub.preview",
      "com.artsum.agenthub",
    ].every((required) => documents.releaseSkill.includes(required))
    && /self-hosted documentation/i.test(documents.releaseSkill)
    && !/TeamCity|GitHub Pages|origin\/main|Branch:\s+main|asia\.yzsd\.agenthub/.test(documents.releaseSkill);
  if (!releaseSkillIsCurrent) {
    issues.push({
      code: "release-skill-drift",
      message: "release skill must use protected GitLab/master, current App identifiers, and self-hosted documentation",
    });
  }

  if (!documents.privacy.includes("https://agenthub.yzsd.asia/support")
      || /github\.com\/slopus\/(?:agenthub|happy)\/issues/i.test(documents.privacy)) {
    issues.push({
      code: "privacy-contact-drift",
      message: "privacy contact must use the current AgentHub support endpoint instead of the upstream GitHub tracker",
    });
  }
  return issues;
}

export function checkReleaseMetadata(repoRoot = root): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  const cliPackage = readJson(path.join(repoRoot, "packages/agenthub-cli/package.json"));
  const appPackage = readJson(path.join(repoRoot, "packages/agenthub-app/package.json"));
  const appConfig = fs.readFileSync(path.join(repoRoot, "packages/agenthub-app/app.config.js"), "utf8");
  const projectStatus = fs.readFileSync(path.join(repoRoot, "docs/project-status.md"), "utf8");
  const verification = fs.readFileSync(path.join(repoRoot, "docs/verification-matrix.md"), "utf8");
  const deployment = fs.readFileSync(path.join(repoRoot, "packages/agenthub-server/deploy/base/agenthub.yaml"), "utf8");
  const webDeployment = readTextOrEmpty(path.join(repoRoot, "packages/agenthub-app/deploy/agenthub-app.yaml"));
  const releaseSkill = readTextOrEmpty(path.join(repoRoot, ".agents/skills/release/SKILL.md"));
  const devSkill = readTextOrEmpty(path.join(repoRoot, ".agents/skills/dev/SKILL.md"));
  const privacy = readTextOrEmpty(path.join(repoRoot, "PRIVACY.md"));
  const ci = fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8");
  const providerManifestPath = path.join(repoRoot, "scripts/provider-tools/package.json");
  const providerManifest = fs.existsSync(providerManifestPath) ? readJson(providerManifestPath) : {};
  const providerLock = readTextOrEmpty(path.join(repoRoot, "scripts/provider-tools/pnpm-lock.yaml"));
  issues.push(...checkOperationalDocumentation({ devSkill, releaseSkill, privacy }));
  for (const dockerfile of ["Dockerfile", "Dockerfile.server", "Dockerfile.webapp"]) {
    const content = fs.readFileSync(path.join(repoRoot, dockerfile), "utf8");
    if (checkPinnedDockerBaseImages(content).length > 0) {
      issues.push({ code: "docker-digest", message: `${dockerfile} has an unpinned runtime FROM image` });
    }
  }

  const expectedPackageManager = "pnpm@10.11.0+sha512.6540583f41cc5f628eb3d9773ecee802f4f9ef9923cc45b69890fb47991d4b092964694ec3a4f738a420c918a333062c8b925d312f42e4f0c263eb603551f977";
  if (rootPackage.packageManager !== expectedPackageManager) {
    issues.push({ code: "package-manager", message: `root packageManager must pin pnpm 10.11.0 with its exact sha512 archive hash: ${expectedPackageManager}` });
  }
  if (Object.keys(rootPackage.dependencies ?? {}).length > 0 || Object.keys(rootPackage.devDependencies ?? {}).length > 20) {
    issues.push({ code: "root-dependency-boundary", message: "root package must not carry a runtime dependency snapshot or more than 20 tooling dependencies" });
  }
  const appVersion = appConfig.match(/version:\s*[\"']([^\"']+)[\"']/)?.[1];
  if (!appVersion || appVersion !== rootPackage.version) {
    issues.push({ code: "app-version", message: `app version ${appVersion ?? "missing"} differs from root ${rootPackage.version}` });
  }
  for (const required of ["com.artsum.agenthub", "https://agenthub.yzsd.asia:8443", "runtimeVersion: \"1\""]) {
    if (!appConfig.includes(required) && !projectStatus.includes(required) && !verification.includes(required)) {
      issues.push({ code: "metadata-reference", message: `required release reference missing: ${required}` });
    }
  }
  const digestSentinel = `image: agenthub-server@sha256:${"0".repeat(64)}`;
  if (!deployment.includes(digestSentinel) || deployment.includes("agenthub-server:{version}")) {
    issues.push({ code: "image-template", message: "Kubernetes deployment must use the immutable agenthub-server digest sentinel" });
  }
  const webDigestSentinel = `image: agenthub-app@sha256:${"0".repeat(64)}`;
  if (!webDeployment.includes(webDigestSentinel) || webDeployment.includes("{version}")) {
    issues.push({ code: "web-image-template", message: "Web Kubernetes deployment must use the immutable agenthub-app digest sentinel" });
  }
  const staleReleaseSkill = /TeamCity|Lab_AgentHub|handy-server|docker\.korshakov\.com@|deploy@artsum|origin\/main|Branch:\s+main/;
  for (const required of [
    "GitLab",
    "master",
    "scripts/runSignedKubernetesRelease.cjs",
    "--component web",
    "--component server",
    "External Secrets stable `external-secrets.io/v1`",
    "packages/agenthub-app/deploy/agenthub-app.yaml",
    "packages/agenthub-server/deploy/base/agenthub.yaml",
  ]) {
    if (!releaseSkill.includes(required)) {
      issues.push({ code: "release-skill-drift", message: `release skill missing current deployment reference: ${required}` });
    }
  }
  if (staleReleaseSkill.test(releaseSkill)) {
    issues.push({ code: "release-skill-drift", message: "release skill still references a legacy branch, CI system, image or manifest" });
  }
  const admissionPolicy = path.join(repoRoot, "packages/agenthub-server/deploy/policies/require-immutable-agenthub-images.yaml");
  const signaturePolicy = path.join(repoRoot, "packages/agenthub-server/deploy/policies/require-signed-agenthub-images.yaml");
  const registryExternalSecret = path.join(repoRoot, "packages/agenthub-server/deploy/agenthub-registry-external-secret.yaml");
  const releaseRenderer = path.join(repoRoot, "scripts/renderKubernetesRelease.cjs");
  const signedReleaseRunner = path.join(repoRoot, "scripts/runSignedKubernetesRelease.cjs");
  if (!fs.existsSync(admissionPolicy)
      || !fs.existsSync(releaseRenderer)
      || rootPackage.scripts?.["docker:policy"]
        !== "vitest run scripts/dockerBuildScope.test.ts scripts/kubernetesAdmissionPolicy.test.ts") {
    issues.push({
      code: "ci-release-gate",
      message: "required Kubernetes immutable image admission and renderer gate is missing",
    });
  }
  const signaturePolicyContent = readTextOrEmpty(signaturePolicy);
  const registryExternalSecretContent = readTextOrEmpty(registryExternalSecret);
  if (!fs.existsSync(signedReleaseRunner)
      || !signaturePolicyContent.includes("signatureFormat: bundle")
      || !signaturePolicyContent.includes("https://sigstore.dev/cosign/sign/v1")
      || !registryExternalSecretContent.includes("apiVersion: external-secrets.io/v1")
      || rootPackage.scripts?.["release-image:policy"] !== "vitest run scripts/signedKubernetesRelease.test.ts"
      || !rootPackage.scripts?.["ci:verify"]?.includes("pnpm release-image:policy")) {
    issues.push({
      code: "ci-release-gate",
      message: "required signed image bundle admission, ExternalSecret v1 and release orchestration gate is missing",
    });
  }
  if (appPackage.version && appPackage.version !== rootPackage.version) {
    issues.push({ code: "app-package-version", message: `app package version ${appPackage.version} differs from root ${rootPackage.version}` });
  }
  if (!projectStatus.includes(`版本 \`${cliPackage.version}\``)) {
    issues.push({ code: "cli-doc-version", message: `docs/project-status.md does not declare CLI version ${cliPackage.version}` });
  }
  for (const required of [
    "supply-chain:sbom:",
    "supply-chain:audit:",
    "supply-chain:license:",
    "web:export:",
    "scripts/verifyProvenance.cjs",
  ]) {
    if (!ci.includes(required)) issues.push({ code: "ci-release-gate", message: `.gitlab-ci.yml missing required release gate: ${required}` });
  }
  for (const required of [
    "pnpm sbom:generate --lockfile scripts/provider-tools/pnpm-lock.yaml --output reports/sbom/provider-tools.cdx.json",
    "pnpm --dir scripts/provider-tools --ignore-workspace audit --json > reports/security/provider-tools-pnpm-audit.json",
    "pnpm audit:check reports/security/provider-tools-pnpm-audit.json high",
    "pnpm reachability:check reports/security/provider-tools-pnpm-audit.json --output reports/security/provider-tools-reachable-high-critical.json",
    "osv-scanner scan source --lockfile scripts/provider-tools/pnpm-lock.yaml",
    "pnpm --dir scripts/provider-tools --ignore-workspace licenses list --prod --json > reports/security/provider-tools-licenses.json",
    "reports/sbom/provider-tools.cdx.sigstore.json",
  ]) {
    if (!ci.includes(required)) {
      issues.push({ code: "ci-release-gate", message: `.gitlab-ci.yml does not cover the frozen provider toolchain: ${required}` });
    }
  }
  for (const required of ["cli:platform-matrix:macos:", "cli:platform-matrix:windows:"]) {
    if (!ci.includes(required)) {
      issues.push({ code: "ci-release-gate", message: `.gitlab-ci.yml missing required platform lifecycle gate: ${required}` });
    }
  }
  if (rootPackage.scripts?.["cli-registry-release-drill:test"]
      !== "node --test scripts/localNpmRegistry.test.cjs scripts/cliRegistryReleaseDrill.test.cjs"
      || !rootPackage.scripts?.["ci:verify"]?.includes("pnpm cli-registry-release-drill:test")
      || !ci.includes("pnpm ci:verify")) {
    issues.push({
      code: "ci-release-gate",
      message: "required registry publish/upgrade/rollback drill must run through final ci:verify",
    });
  }
  if (!ci.includes("cli:provider-matrix:")) {
    issues.push({ code: "ci-release-gate", message: ".gitlab-ci.yml missing required provider lifecycle matrix: cli:provider-matrix:" });
  } else {
    const providerJob = ci.match(/cli:provider-matrix:[\s\S]*?(?=\n(?:[^ \n#]|#)|$)/)?.[0] ?? "";
    if (!providerJob.includes("tags:\n    - provider-matrix")) {
      issues.push({ code: "ci-release-gate", message: "provider matrix runner tag must be protected provider-matrix" });
    }
    const expectedProviderTools = {
      "@anthropic-ai/claude-code": "2.1.207",
      "@openai/codex": "0.144.1",
    };
    for (const [name, version] of Object.entries(expectedProviderTools)) {
      if (providerManifest.dependencies?.[name] !== version
          || !providerLock.includes(`${name}@${version}`)) {
        issues.push({ code: "ci-release-gate", message: `provider matrix frozen CLI pin missing: ${name}@${version}` });
      }
    }
    if (!providerJob.includes("pnpm --dir scripts/provider-tools --ignore-workspace install --frozen-lockfile")
      || !providerJob.includes('export PATH="$CI_PROJECT_DIR/scripts/provider-tools/node_modules/.bin:$PATH"')
      || /npm install --global[^\n]+(?:codex|claude-code)/.test(providerJob)) {
      issues.push({
        code: "ci-release-gate",
        message: "provider matrix tools must install from the repository frozen integrity lock",
      });
    }
    const node22ProviderImage = "image: node:22-bookworm@sha256:5647be709086c696ff32edaaf1c70cd26d1da6ab2b39c32f3c7b4c4a31957e37";
    if (!providerJob.includes(node22ProviderImage)) {
      issues.push({
        code: "ci-release-gate",
        message: "provider jobs must use the immutable Node 22 image required by Claude Code",
      });
    }
    if (!providerJob.includes("when: always")
      || !providerJob.includes("reports/provider/runner-matrix.log")) {
      issues.push({ code: "ci-release-gate", message: "provider matrix runner artifacts must be retained when always" });
    }
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const issues = checkReleaseMetadata();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ ok: issues.length === 0, issues }, null, 2)}\n`);
  } else if (issues.length > 0) {
    for (const issue of issues) process.stderr.write(`[${issue.code}] ${issue.message}\n`);
  } else {
    process.stdout.write("release metadata: OK\n");
  }
  process.exitCode = issues.length === 0 ? 0 : 1;
}
