import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkOperationalDocumentation, checkPinnedDockerBaseImages, checkReleaseMetadata } from "./releaseMetadata";

describe("release metadata contract", () => {
  it("rejects stale development, release, and privacy authority references", () => {
    expect(checkOperationalDocumentation({
      devSkill: [
        "packages/agenthub-server # deployed via TeamCity",
        "development asia.yzsd.agenthub.dev",
        "preview com.artsum.agenthub.preview",
        "production asia.yzsd.agenthub",
        "Integration tests hit real APIs and are flaky — run on demand, never in the release gate.",
        "Use /release for GitHub releases.",
      ].join("\n"),
      releaseSkill: "protected GitLab/master; development asia.yzsd.agenthub.dev; preview com.artsum.agenthub.preview; production com.artsum.agenthub; self-hosted documentation",
      privacy: "GitHub Issues: https://github.com/slopus/agenthub/issues",
    }).map((issue) => issue.code)).toEqual([
      "dev-skill-drift",
      "release-skill-drift",
      "privacy-contact-drift",
    ]);

    expect(checkOperationalDocumentation({
      devSkill: [
        "development com.artsum.agenthub.dev",
        "preview com.artsum.agenthub.preview",
        "production com.artsum.agenthub",
        "Remote GitLab jobs are outside the current hardening completion target.",
        "Remote CI evidence belongs to release operations, not to the local hardening goal's completion criteria.",
      ].join("\n"),
      releaseSkill: "protected GitLab/master; development com.artsum.agenthub.dev; preview com.artsum.agenthub.preview; production com.artsum.agenthub; self-hosted documentation",
      privacy: "Support: https://agenthub.yzsd.asia/support",
    })).toEqual([]);
  });

  it("requires digests only for external Docker images, not internal stages", () => {
    const digest = "a".repeat(64);
    const dockerfile = [
      `FROM node:20@sha256:${digest} AS builder`,
      "FROM builder AS production-deps",
      "FROM production-deps AS runner",
    ].join("\n");

    expect(checkPinnedDockerBaseImages(dockerfile)).toEqual([]);
    expect(checkPinnedDockerBaseImages(dockerfile.replace(`node:20@sha256:${digest}`, "node:20")))
      .toEqual(["FROM node:20 AS builder"]);
  });

  it("passes the checked-in release metadata", () => {
    expect(checkReleaseMetadata()).toEqual([]);
  });

  it("rejects version drift", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-release-") );
    fs.cpSync(path.resolve(__dirname, "..", "package.json"), path.join(temp, "package.json"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-app"), { recursive: true });
    fs.cpSync(path.resolve(__dirname, "..", "packages/agenthub-app/package.json"), path.join(temp, "packages/agenthub-app/package.json"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-cli"), { recursive: true });
    fs.cpSync(path.resolve(__dirname, "..", "packages/agenthub-cli/package.json"), path.join(temp, "packages/agenthub-cli/package.json"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-app"), { recursive: true });
    fs.cpSync(path.resolve(__dirname, "..", "packages/agenthub-app/app.config.js"), path.join(temp, "packages/agenthub-app/app.config.js"));
    fs.mkdirSync(path.join(temp, "docs"), { recursive: true });
    fs.cpSync(path.resolve(__dirname, "..", "docs/project-status.md"), path.join(temp, "docs/project-status.md"));
    fs.cpSync(path.resolve(__dirname, "..", "docs/verification-matrix.md"), path.join(temp, "docs/verification-matrix.md"));
    fs.cpSync(path.resolve(__dirname, "..", ".gitlab-ci.yml"), path.join(temp, ".gitlab-ci.yml"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-server/deploy/base"), { recursive: true });
    fs.cpSync(path.resolve(__dirname, "..", "packages/agenthub-server/deploy/base/agenthub.yaml"), path.join(temp, "packages/agenthub-server/deploy/base/agenthub.yaml"));
    for (const dockerfile of ["Dockerfile", "Dockerfile.server", "Dockerfile.webapp"]) {
      fs.cpSync(path.resolve(__dirname, "..", dockerfile), path.join(temp, dockerfile));
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(temp, "package.json"), "utf8"));
    pkg.version = "9.9.9";
    fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify(pkg));
    expect(checkReleaseMetadata(temp).some((issue) => issue.code === "app-version")).toBe(true);
    fs.writeFileSync(path.join(temp, "Dockerfile"), "FROM node:20 AS runtime\n");
    expect(checkReleaseMetadata(temp).some((issue) => issue.code === "docker-digest")).toBe(true);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it("rejects an unpinned runtime image in a focused fixture", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-release-docker-"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-app", "plugins"), { recursive: true });
    fs.mkdirSync(path.join(temp, "packages/agenthub-cli"), { recursive: true });
    fs.mkdirSync(path.join(temp, "packages/agenthub-server/deploy/base"), { recursive: true });
    fs.mkdirSync(path.join(temp, "docs"), { recursive: true });
    fs.cpSync(path.resolve(__dirname, "..", ".gitlab-ci.yml"), path.join(temp, ".gitlab-ci.yml"));
    fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({ version: "1.0.0", packageManager: "pnpm@10.11.0" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-app/package.json"), JSON.stringify({ version: "1.0.0" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-cli/package.json"), JSON.stringify({ version: "1.0.3" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-app/app.config.js"), "version: \"1.0.0\" runtimeVersion: \"1\" com.artsum.agenthub");
    fs.writeFileSync(path.join(temp, "docs/project-status.md"), "版本 `1.0.3` https://agenthub.yzsd.asia:8443");
    fs.writeFileSync(path.join(temp, "docs/verification-matrix.md"), "1.0.0 runtimeVersion: \"1\"");
    fs.writeFileSync(path.join(temp, "packages/agenthub-server/deploy/base/agenthub.yaml"), "image: agenthub-server:{version}");
    fs.writeFileSync(path.join(temp, "Dockerfile"), "FROM node:20@sha256:" + "a".repeat(64) + " AS runtime\n");
    fs.writeFileSync(path.join(temp, "Dockerfile.server"), "FROM node:20@sha256:" + "a".repeat(64) + " AS runtime\n");
    fs.writeFileSync(path.join(temp, "Dockerfile.webapp"), "FROM node:20 AS runtime\n");
    expect(checkReleaseMetadata(temp).some((issue) => issue.code === "docker-digest")).toBe(true);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it("rejects mutable Web deployment metadata and a stale release skill", () => {
    const sourceRoot = path.resolve(__dirname, "..");
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-release-web-k8s-"));
    const files = [
      "package.json",
      ".gitlab-ci.yml",
      "Dockerfile",
      "Dockerfile.server",
      "Dockerfile.webapp",
      "packages/agenthub-app/package.json",
      "packages/agenthub-app/app.config.js",
      "packages/agenthub-app/deploy/agenthub-app.yaml",
      "packages/agenthub-cli/package.json",
      "packages/agenthub-server/deploy/base/agenthub.yaml",
      "packages/agenthub-server/deploy/policies/require-immutable-agenthub-images.yaml",
      "scripts/renderKubernetesRelease.cjs",
      "docs/project-status.md",
      "docs/verification-matrix.md",
      ".agents/skills/release/SKILL.md",
    ];
    for (const file of files) {
      const destination = path.join(temp, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(path.join(sourceRoot, file), destination);
    }
    fs.writeFileSync(
      path.join(temp, "packages/agenthub-app/deploy/agenthub-app.yaml"),
      "image: registry.example.invalid/agenthub-app:{version}\n",
    );
    fs.writeFileSync(path.join(temp, ".agents/skills/release/SKILL.md"), "Web releases go through TeamCity on main\n");

    const issues = checkReleaseMetadata(temp);
    expect(issues.some((issue) => issue.code === "web-image-template")).toBe(true);
    expect(issues.some((issue) => issue.code === "release-skill-drift")).toBe(true);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it("rejects a release pipeline without the required security gates", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-release-ci-"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-app"), { recursive: true });
    fs.mkdirSync(path.join(temp, "packages/agenthub-cli"), { recursive: true });
    fs.mkdirSync(path.join(temp, "packages/agenthub-server/deploy"), { recursive: true });
    fs.mkdirSync(path.join(temp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({ version: "1.0.0", packageManager: "pnpm@10.11.0" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-app/package.json"), JSON.stringify({ version: "1.0.0" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-cli/package.json"), JSON.stringify({ version: "1.0.3" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-app/app.config.js"), "version: \"1.0.0\" runtimeVersion: \"1\" com.artsum.agenthub");
    fs.writeFileSync(path.join(temp, "docs/project-status.md"), "版本 `1.0.3` https://agenthub.yzsd.asia:8443");
    fs.writeFileSync(path.join(temp, "docs/verification-matrix.md"), "1.0.0 runtimeVersion: \"1\"");
    fs.mkdirSync(path.join(temp, "packages/agenthub-server/deploy/base"), { recursive: true });
    fs.writeFileSync(path.join(temp, "packages/agenthub-server/deploy/base/agenthub.yaml"), "image: agenthub-server:{version}");
    for (const dockerfile of ["Dockerfile", "Dockerfile.server", "Dockerfile.webapp"]) fs.writeFileSync(path.join(temp, dockerfile), "FROM node:20@sha256:" + "a".repeat(64) + " AS runtime\n");
    fs.writeFileSync(path.join(temp, ".gitlab-ci.yml"), "validate:\n  script: [pnpm check]\n");
    expect(checkReleaseMetadata(temp).some((issue) => issue.code === "ci-release-gate")).toBe(true);
    expect(checkReleaseMetadata(temp).some((issue) => issue.message.includes("platform lifecycle"))).toBe(true);
    expect(checkReleaseMetadata(temp).some((issue) => issue.message.includes("provider lifecycle matrix"))).toBe(true);
    expect(checkReleaseMetadata(temp).some((issue) => issue.message.includes("registry publish/upgrade/rollback"))).toBe(true);
    expect(checkReleaseMetadata(temp).some((issue) => issue.message.includes("Kubernetes immutable image admission"))).toBe(true);
    expect(checkReleaseMetadata(temp).some((issue) => issue.message.includes("signed image bundle admission"))).toBe(true);
    fs.writeFileSync(path.join(temp, ".gitlab-ci.yml"), "cli:provider-matrix:\n  stage: test\n  allow_failure: false\n");
    expect(checkReleaseMetadata(temp).some((issue) => issue.message.includes("provider matrix runner tag"))).toBe(true);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  it("rejects a root dependency snapshot", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-release-root-deps-"));
    fs.mkdirSync(path.join(temp, "packages/agenthub-app"), { recursive: true });
    fs.mkdirSync(path.join(temp, "packages/agenthub-cli"), { recursive: true });
    fs.mkdirSync(path.join(temp, "packages/agenthub-server/deploy"), { recursive: true });
    fs.mkdirSync(path.join(temp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify({ version: "1.0.0", packageManager: "pnpm@10.11.0", dependencies: { bad: "1.0.0" } }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-app/package.json"), JSON.stringify({ version: "1.0.0" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-cli/package.json"), JSON.stringify({ version: "1.0.3" }));
    fs.writeFileSync(path.join(temp, "packages/agenthub-app/app.config.js"), "version: \"1.0.0\" runtimeVersion: \"1\" com.artsum.agenthub");
    fs.writeFileSync(path.join(temp, "docs/project-status.md"), "版本 `1.0.3` https://agenthub.yzsd.asia:8443");
    fs.writeFileSync(path.join(temp, "docs/verification-matrix.md"), "1.0.0 runtimeVersion: \"1\"");
    fs.mkdirSync(path.join(temp, "packages/agenthub-server/deploy/base"), { recursive: true });
    fs.writeFileSync(path.join(temp, "packages/agenthub-server/deploy/base/agenthub.yaml"), "image: agenthub-server:{version}");
    fs.writeFileSync(path.join(temp, ".gitlab-ci.yml"), "supply-chain:sbom: supply-chain:audit: supply-chain:license: web:export: scripts/verifyProvenance.cjs");
    for (const dockerfile of ["Dockerfile", "Dockerfile.server", "Dockerfile.webapp"]) fs.writeFileSync(path.join(temp, dockerfile), "FROM node:20@sha256:" + "a".repeat(64) + " AS runtime\n");
    expect(checkReleaseMetadata(temp).some((issue) => issue.code === "root-dependency-boundary")).toBe(true);
    fs.rmSync(temp, { recursive: true, force: true });
  });
});
