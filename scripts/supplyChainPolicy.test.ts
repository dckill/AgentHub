import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import YAML from "yaml";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function readManifest(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    pnpm?: { overrides?: Record<string, string>; onlyBuiltDependencies?: string[] };
  };
}

function declaredVersion(manifest: ReturnType<typeof readManifest>, name: string) {
  return (
    manifest.dependencies?.[name] ??
    manifest.devDependencies?.[name] ??
    manifest.optionalDependencies?.[name]
  );
}

function expectFloor(manifestPath: string, floors: Record<string, string>) {
  const manifest = readManifest(manifestPath);
  for (const [name, floor] of Object.entries(floors)) {
    const declared = declaredVersion(manifest, name);
    expect(declared, `${manifestPath} must declare ${name}`).toBeTruthy();
    const min = declared ? semver.minVersion(declared)?.version : undefined;
    expect(
      min && semver.gte(min, floor),
      `${manifestPath} ${name} must resolve from a declaration at or above ${floor}, got ${declared}`,
    ).toBe(true);
  }
}

describe("supply-chain package floors", () => {
  it("keeps the root manifest limited to explicit tooling", () => {
    const manifest = readManifest("package.json");
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([]);
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual([
      "@types/node", "@types/react", "semver", "tar", "tsx", "typescript", "vitest", "yaml",
    ]);
  });

  it("keeps workspace runtime declarations above audited high-severity floors", () => {
    expectFloor("packages/agenthub-cli/package.json", {
      "@modelcontextprotocol/sdk": "1.26.0",
      axios: "1.16.0",
      fastify: "5.8.5",
      "http-proxy-middleware": "3.0.7",
      tar: "7.5.11",
      tmp: "0.2.7",
      ws: "8.21.0",
    });
    expectFloor("packages/agenthub-agent/package.json", { axios: "1.16.0" });
    expectFloor("packages/agenthub-app/package.json", {
      "@babel/core": "7.29.6",
      axios: "1.16.0",
      mermaid: "11.15.0",
      uuid: "11.1.1",
    });
    expectFloor("packages/agenthub-server/package.json", {
      axios: "1.16.0",
      fastify: "5.8.5",
      minio: "8.0.7",
      tmp: "0.2.7",
      uuid: "11.1.1",
      yaml: "2.8.3",
    });
    expectFloor("packages/codium/package.json", { "react-router-dom": "7.15.0" });
  });

  it("pins known vulnerable transitive packages to patched versions", () => {
    const overrides = readManifest("package.json").pnpm?.overrides ?? {};
    const floors: Record<string, string> = {
      "@anthropic-ai/sdk": "0.91.1",
      "@babel/core": "7.29.6",
      "@hono/node-server": "1.19.14",
      "@xmldom/xmldom": "0.8.13",
      "ajv@6": "6.14.0",
      "ajv@8": "8.18.0",
      "brace-expansion@1": "1.1.13",
      "brace-expansion@5": "5.0.6",
      dompurify: "3.4.11",
      effect: "3.20.0",
      "fast-xml-parser": "5.7.0",
      "follow-redirects": "1.16.0",
      "ip-address": "10.1.1",
      "js-yaml@3": "3.15.0",
      "js-yaml@4": "4.2.0",
      lodash: "4.18.0",
      mermaid: "11.15.0",
      "minimatch@3": "3.1.4",
      "postcss@8": "8.5.10",
      qs: "6.15.2",
      "react-router": "7.15.1",
      rollup: "4.59.0",
      "shell-quote": "1.8.4",
      "socket.io-parser": "4.2.6",
      tmp: "0.2.7",
      undici: "6.27.0",
      "uuid@3": "11.1.1",
      "uuid@7": "11.1.1",
      "uuid@9": "11.1.1",
      "uuid@11": "11.1.1",
      "whatwg-url": "14.2.0",
      "ws@8": "8.21.0",
      "yaml@1": "1.10.3",
      "yaml@2": "2.8.3",
    };
    for (const [name, floor] of Object.entries(floors)) {
      const value = overrides[name];
      expect(value, `pnpm override ${name} is required`).toBeTruthy();
      expect(
        value && semver.gte(semver.minVersion(value)?.version ?? "0.0.0", floor),
        `pnpm override ${name} must be at least ${floor}, got ${value}`,
      ).toBe(true);
    }
  });
});

describe("Claude runtime licensing boundary", () => {
  it("uses the separately installed pinned Claude CLI instead of shipping the proprietary Agent SDK", () => {
    for (const manifestPath of ["packages/agenthub-cli/package.json", "packages/codium/package.json"]) {
      const manifest = readManifest(manifestPath);
      expect(declaredVersion(manifest, "@anthropic-ai/claude-agent-sdk"), manifestPath).toBeUndefined();
    }

    const sdkSource = fs.readFileSync(path.join(repoRoot, "packages/agenthub-cli/src/claude/sdk/query.ts"), "utf8")
      + fs.readFileSync(path.join(repoRoot, "packages/agenthub-cli/src/claude/sdk/types.ts"), "utf8");
    expect(sdkSource).not.toContain("@anthropic-ai/claude-agent-sdk");

    const providerManifest = readManifest("scripts/provider-tools/package.json");
    expect(providerManifest.dependencies?.["@anthropic-ai/claude-code"]).toBe("2.1.207");
  });

  it("installs every protected provider executable from a frozen integrity lock", () => {
    const providerManifest = readManifest("scripts/provider-tools/package.json");
    expect(providerManifest.dependencies).toEqual({
      "@anthropic-ai/claude-code": "2.1.207",
      "@openai/codex": "0.144.1",
    });
    expect(providerManifest.pnpm?.onlyBuiltDependencies).toEqual([
      "@anthropic-ai/claude-code",
      "@github/keytar",
      "node-pty",
    ]);

    const lock = fs.readFileSync(path.join(repoRoot, "scripts/provider-tools/pnpm-lock.yaml"), "utf8");
    expect(lock).toContain("lockfileVersion:");
    const parsedLock = YAML.parse(lock) as { packages?: Record<string, { resolution?: { integrity?: string } }> };
    const lockedPackages = Object.entries(parsedLock.packages ?? {});
    expect(lockedPackages.length).toBeGreaterThan(0);
    for (const [coordinate, entry] of lockedPackages) {
      expect(entry.resolution?.integrity, `${coordinate} must have a locked archive integrity`).toMatch(/^sha512-/);
    }
    const ci = fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8");
    const parsed = YAML.parse(ci);
    const node22ProviderImage = "node:22-bookworm@sha256:5647be709086c696ff32edaaf1c70cd26d1da6ab2b39c32f3c7b4c4a31957e37";
    expect(parsed["cli:provider-matrix"].image).toBe(node22ProviderImage);
    expect(ci).toContain("pnpm --dir scripts/provider-tools --ignore-workspace install --frozen-lockfile");
    expect(ci).toContain('export PATH="$CI_PROJECT_DIR/scripts/provider-tools/node_modules/.bin:$PATH"');
    expect(ci).not.toMatch(/npm install --global[^\n]+claude-code/);
  });
});

describe("CLI test runtime isolation", () => {
  it("never rebuilds the production daemon bundle from Vitest global setup", () => {
    const setup = fs.readFileSync(path.join(repoRoot, "packages/agenthub-cli/src/test-setup.ts"), "utf8");
    expect(setup).not.toMatch(/spawnSync\([^\n]+['\"]build['\"]/);
    expect(setup).not.toContain("Build stderr");
  });
});

describe("supply-chain CI artifact", () => {
  it("pins the pnpm bootstrap archive by sha512 instead of trusting a mutable registry response", () => {
    const manifest = readManifest("package.json");
    const expectedPackageManager = "pnpm@10.11.0+sha512.6540583f41cc5f628eb3d9773ecee802f4f9ef9923cc45b69890fb47991d4b092964694ec3a4f738a420c918a333062c8b925d312f42e4f0c263eb603551f977";
    expect(manifest.packageManager).toBe(expectedPackageManager);

    const ci = fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8");
    expect(ci).not.toContain("corepack prepare pnpm@10.11.0");
    expect(ci).toContain('COREPACK_DEFAULT_TO_LATEST: "0"');

    for (const dockerfile of ["Dockerfile", "Dockerfile.server", "Dockerfile.webapp"]) {
      const content = fs.readFileSync(path.join(repoRoot, dockerfile), "utf8");
      expect(content, `${dockerfile} must let Corepack enforce the manifest hash`).not.toContain("corepack prepare pnpm@10.11.0");
      expect(content, `${dockerfile} must disable Corepack latest-version lookup`).toContain("COREPACK_DEFAULT_TO_LATEST=0");
    }
  });

  it("isolates dependency caches between protected and unprotected pipelines", () => {
    const ci = YAML.parse(fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8")) as Record<string, any>;
    expect(ci.cache?.key?.prefix).toBe("$CI_COMMIT_REF_PROTECTED");
    expect(ci.cache?.key?.files).toEqual(["pnpm-lock.yaml"]);
    expect(ci.cache?.unprotect).toBe(false);
    expect(ci.cache?.paths).toEqual([".pnpm-store/"]);
  });

  it("pins every GitLab container image and service by sha256 digest", () => {
    const ci = YAML.parse(fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8")) as Record<string, any>;
    const imagePattern = /@sha256:[a-f0-9]{64}$/;
    const imageName = (image: unknown) => typeof image === "string"
      ? image
      : (image && typeof image === "object" ? (image as { name?: unknown }).name : undefined);
    const assertPinned = (image: unknown, location: string) => {
      const name = imageName(image);
      expect(typeof name, `${location} must declare an image name`).toBe("string");
      expect(name, `${location} must pin an immutable sha256 digest`).toMatch(imagePattern);
    };

    assertPinned(ci.default?.image, "default.image");
    for (const [jobName, job] of Object.entries(ci)) {
      if (!job || typeof job !== "object") continue;
      if (Object.hasOwn(job, "image")) assertPinned(job.image, `${jobName}.image`);
      if (Array.isArray(job.services)) {
        job.services.forEach((service: unknown, index: number) => assertPinned(service, `${jobName}.services[${index}]`));
      }
    }
  });

  it("builds, clean-installs, and executes the published CLI before retaining its tarball", () => {
    const manifest = readManifest("package.json");
    const ci = YAML.parse(fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8")) as Record<string, any>;
    const packJob = ci["pack:check"];

    expect(manifest.scripts?.["cli-pack-install:test"]).toBe(
      "node --test scripts/unpackTools.test.cjs scripts/cliPackInstall.test.cjs",
    );
    expect(manifest.scripts?.["ci:verify"]).toContain("pnpm cli-pack-install:test");
    expect(packJob).toBeTruthy();
    expect(packJob.allow_failure).toBe(false);
    expect(packJob.script).toEqual([
      "pnpm --filter @artsum/agenthub build",
      "pnpm cli-pack-install:test",
      "mkdir -p reports/pack",
      "pnpm --filter @artsum/agenthub pack --pack-destination reports/pack",
    ]);
  });

  it("requires keyless Sigstore signing and identity-bound verification for SBOM artifacts", () => {
    const ci = fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8");
    const parsed = YAML.parse(ci) as Record<string, any>;
    const job = parsed["supply-chain:sign"];

    expect(job).toBeTruthy();
    expect(job.extends).toBe(".required");
    expect(job.allow_failure).toBe(false);
    expect(job.rules).toEqual([
      { if: '$CI_COMMIT_BRANCH == "master" && $CI_COMMIT_REF_PROTECTED == "true"' },
    ]);
    expect(job.before_script).toEqual([]);
    expect(job.image).toContain("@sha256:");
    expect(job.id_tokens?.SIGSTORE_ID_TOKEN?.aud).toBe("sigstore");
    expect(job.needs).toEqual(expect.arrayContaining([
      expect.objectContaining({ job: "supply-chain:sbom", artifacts: true }),
    ]));
    expect(job.variables?.COSIGN_YES).toBe("true");
    expect(job.variables?.COSIGN_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(job.variables?.COSIGN_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(job.script.join("\n")).toContain("sha256sum -c -");
    expect(job.script.join("\n")).toContain("cosign sign-blob");
    expect(job.script.join("\n")).toContain("cosign verify-blob");
    expect(job.script.join("\n")).toContain("--certificate-identity");
    expect(job.script.join("\n")).toContain("${CI_PROJECT_URL}//.gitlab-ci.yml@refs/heads/master");
    expect(job.script.join("\n")).toContain("--certificate-oidc-issuer");
    expect(job.script.join("\n")).toContain("${CI_SERVER_URL}");
    expect(job.artifacts?.when).toBe("always");
    expect(job.artifacts?.paths).toEqual(expect.arrayContaining([
      "reports/sbom/agenthub.cdx.sigstore.json",
      "reports/sbom/provider-tools.cdx.sigstore.json",
      "reports/sbom/server-runtime.cdx.sigstore.json",
      "reports/sbom/agenthub.provenance.sigstore.json",
    ]));
  });

  it("publishes the deterministic CycloneDX SBOM as a required GitLab artifact", () => {
    const ci = fs.readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8");
    const parsed = YAML.parse(ci) as Record<string, unknown>;
    expect(parsed["supply-chain:sbom"]).toBeTruthy();
    expect(parsed["supply-chain:audit"]).toBeTruthy();
    expect(parsed["supply-chain:osv"]).toBeTruthy();
    expect(parsed["supply-chain:license"]).toBeTruthy();
    const osvJob = parsed["supply-chain:osv"] as {
      image: { name: string; entrypoint: string[] };
      before_script: string[];
      allow_failure: boolean;
      artifacts: { when: string; paths: string[] };
    };
    expect(osvJob.image.name).toContain("@sha256:");
    expect(osvJob.image.entrypoint).toEqual([""]);
    expect(osvJob.before_script).toEqual([]);
    expect(osvJob.allow_failure).toBe(false);
    expect(osvJob.artifacts.when).toBe("always");
    expect(osvJob.artifacts.paths).toContain("reports/security/osv-scanner.json");
    expect(osvJob.artifacts.paths).toContain("reports/security/provider-tools-osv-scanner.json");
    expect(osvJob.artifacts.paths).toContain("reports/security/server-runtime-osv-scanner.json");
    expect(parsed["release:metadata"]).toBeTruthy();
    expect(parsed["final:verify"]).toBeTruthy();
    expect(parsed["server:test"]).toBeTruthy();
    expect(parsed["wire:test"]).toBeTruthy();
    expect(parsed["cli:unit"]).toBeTruthy();
    expect(parsed["cli:provider-matrix"]).toBeTruthy();
    expect(parsed["cli:provider-matrix"].tags).toEqual(["provider-matrix"]);
    expect(parsed["cli:provider-matrix"].allow_failure).toBe(false);
    expect(parsed["cli:provider-matrix"].artifacts.when).toBe("always");
    expect(parsed["cli:provider-matrix"].artifacts.paths).toEqual(expect.arrayContaining([
      "reports/provider/runner-matrix.log",
    ]));
    expect(parsed["cli:platform-matrix:macos"]).toBeTruthy();
    expect(parsed["cli:platform-matrix:windows"]).toBeTruthy();
    expect(ci).toContain("supply-chain:sbom:");
    expect(ci).toContain("server:test:");
    expect(ci).toContain("wire:test:");
    expect(ci).toContain("cli:unit:");
    expect(ci).toContain("contract:test:");
    expect(ci).toContain("pack:check:");
    expect(ci).toContain("web:export:");
    expect(ci).toContain("pnpm --filter agenthub-server test");
    expect(ci).toContain("pnpm --filter @artsum/agenthub-wire test");
    expect(ci).toContain("pnpm --filter @artsum/agenthub test:unit");
    expect(ci).toContain("cli:provider-matrix:");
    expect(ci).toContain("AGENTHUB_PROVIDER_MATRIX == \"true\"");
    expect(ci).toContain("stops a real idle Claude runner");
    expect(ci).toContain("closes an active Codex turn");
    expect(ci).toContain("AGENTHUB_PLATFORM_INTEGRATION == \"true\"");
    expect(ci).toContain("tags:\n    - macos");
    expect(ci).toContain("tags:\n    - windows");
    expect(ci).toContain("reports/platform/macos.log");
    expect(ci).toContain("reports/platform/windows.log");
    expect(ci).toContain("pnpm dependency-boundary:test");
    expect(ci).toContain("protocolInventory.test.ts");
    expect(ci).toContain("src/v4Sync.test.ts src/rpc.test.ts");
    expect(ci).toContain("pnpm --filter @artsum/agenthub pack --pack-destination reports/pack");
    expect(ci).toContain("expo export --platform web --output-dir reports/web-export --clear");
    expect(ci).toContain("pnpm web:budget reports/web-export");
    expect(ci).toContain("EXPO_PUBLIC_DEV_TOKEN|EXPO_PUBLIC_DEV_SECRET");
    expect(ci).toContain("pnpm sbom:generate --output reports/sbom/agenthub.cdx.json");
    expect(ci).toContain("pnpm sbom:generate --lockfile scripts/provider-tools/pnpm-lock.yaml --output reports/sbom/provider-tools.cdx.json");
    expect(ci).toContain("pnpm sbom:generate --lockfile packages/agenthub-server-runtime/pnpm-lock.yaml --output reports/sbom/server-runtime.cdx.json");
    expect(ci).toContain("reports/sbom/provider-tools.cdx.json");
    expect(ci).toContain("reports/sbom/server-runtime.cdx.json");
    expect(ci).toContain("scripts/generateProvenance.cjs reports/sbom/agenthub.provenance.json reports/sbom/agenthub.cdx.json reports/sbom/provider-tools.cdx.json reports/sbom/server-runtime.cdx.json");
    expect(ci).toContain("pnpm provenance:test");
    expect(ci).toContain("pnpm provenance:verify:test");
    expect(ci).toContain("scripts/verifyProvenance.cjs reports/sbom/agenthub.provenance.json");
    expect(ci).toContain("agenthub.provenance.json");
    expect(ci).toContain("cyclonedx:");
    expect(ci).toContain("supply-chain:audit:");
    expect(ci).toContain("pnpm audit:test");
    expect(ci).toContain("pnpm reachability:test");
    expect(ci).toContain("pnpm audit --json > reports/security/pnpm-audit.json");
    expect(ci).toContain('test "$audit_exit" -eq 0 -o "$audit_exit" -eq 1');
    expect(ci).toContain("pnpm audit:check reports/security/pnpm-audit.json high");
    expect(ci).toContain("pnpm reachability:check reports/security/pnpm-audit.json");
    expect(ci).toContain("reports/security/reachable-high-critical.json");
    expect(ci).toContain("pnpm --dir scripts/provider-tools --ignore-workspace audit --json > reports/security/provider-tools-pnpm-audit.json");
    expect(ci).toContain("pnpm audit:check reports/security/provider-tools-pnpm-audit.json high");
    expect(ci).toContain("pnpm reachability:check reports/security/provider-tools-pnpm-audit.json --output reports/security/provider-tools-reachable-high-critical.json");
    expect(ci).toContain("pnpm --dir packages/agenthub-server-runtime --ignore-workspace audit --json > reports/security/server-runtime-pnpm-audit.json");
    expect(ci).toContain("pnpm audit:check reports/security/server-runtime-pnpm-audit.json high");
    expect(ci).toContain("pnpm reachability:check reports/security/server-runtime-pnpm-audit.json --output reports/security/server-runtime-reachable-high-critical.json");
    expect(ci).toContain("supply-chain:osv:");
    expect(ci).toContain("ghcr.io/google/osv-scanner@sha256:5116601dedc01c1c580eb92371883ec052fc4c13c3fbc109d621a63ac416d475");
    expect(ci).toContain("osv-scanner scan source --lockfile pnpm-lock.yaml");
    expect(ci).toContain("reports/security/osv-scanner.json");
    expect(ci).toContain("osv-scanner scan source --lockfile scripts/provider-tools/pnpm-lock.yaml");
    expect(ci).toContain("reports/security/provider-tools-osv-scanner.json");
    expect(ci).toContain("osv-scanner scan source --lockfile packages/agenthub-server-runtime/pnpm-lock.yaml");
    expect(ci).toContain("reports/security/server-runtime-osv-scanner.json");
    expect(ci).toContain("supply-chain:license:");
    expect(ci).toContain("pnpm license:test");
    expect(ci).toContain("pnpm licenses list --prod --json");
    expect(ci).toContain("pnpm --dir scripts/provider-tools --ignore-workspace licenses list --prod --json > reports/security/provider-tools-licenses.json");
    expect(ci).toContain("pnpm --dir packages/agenthub-server-runtime --ignore-workspace licenses list --prod --json > reports/security/server-runtime-licenses.json");
    expect(ci).not.toContain("license:check reports/security/provider-tools-licenses.json");
    expect(ci).toContain("pnpm license:check reports/security/licenses.json docs/audits/evidence/2026-07-12-supply-chain/license-provenance.json");
    expect(ci).toContain("docs/audits/evidence/2026-07-12-supply-chain/license-provenance.json");
    expect(ci).toContain("release:metadata:");
    expect(ci).toContain("pnpm metadata:check -- --json");
    expect(ci).toContain("final:verify:");
    expect(ci).toContain("pnpm ci:verify");
    expect(ci).toContain("reports/sbom/agenthub.cdx.json");
    expect(ci).toContain("allow_failure: false");
  });
});
