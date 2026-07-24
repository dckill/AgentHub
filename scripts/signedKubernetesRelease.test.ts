import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseAllDocuments } from 'yaml';

import {
    renderSignedImagePolicy,
    validateSignedImagePolicyOptions,
} from './renderSignedImagePolicy.cjs';
import { runSignedKubernetesRelease } from './runSignedKubernetesRelease.cjs';

const repoRoot = resolve(__dirname, '..');
const templatePath = resolve(
    repoRoot,
    'packages/agenthub-server/deploy/policies/require-signed-agenthub-images.yaml',
);
const ciPath = resolve(repoRoot, '.gitlab-ci.yml');
const serverManifestPath = resolve(repoRoot, 'packages/agenthub-server/deploy/base/agenthub.yaml');
const webManifestPath = resolve(repoRoot, 'packages/agenthub-app/deploy/agenthub-app.yaml');
const registrySecretPath = resolve(
    repoRoot,
    'packages/agenthub-server/deploy/agenthub-registry-external-secret.yaml',
);
const migrationTemplatePath = resolve(
    repoRoot,
    'packages/agenthub-server/deploy/agenthub-migration-job.yaml',
);
const digest = 'a'.repeat(64);
const image = `registry.example.invalid/artsum/agenthub-app@sha256:${digest}`;
const serverImage = `registry.example.invalid/artsum/agenthub-server@sha256:${digest}`;
const migrationDigest = 'c'.repeat(64);
const migrationImage = `registry.example.invalid/artsum/agenthub-server-migration@sha256:${migrationDigest}`;
const options = {
    component: 'web' as const,
    image,
    registryPrefix: 'registry.example.invalid/artsum',
    certificateIdentity: 'https://gitlab.example.invalid/artsum/agenthub//.gitlab-ci.yml@refs/heads/master',
    certificateIssuer: 'https://gitlab.example.invalid',
    namespace: 'agenthub-production',
    manifestOutput: '/tmp/agenthub-web.yaml',
    policyOutput: '/tmp/agenthub-signature-policy.yaml',
    timeout: '120s',
};

describe('signed Kubernetes release boundary', () => {
    it('renders fail-closed keyless policies for only the protected AgentHub registry paths', () => {
        const template = readFileSync(templatePath, 'utf8');
        const rendered = renderSignedImagePolicy(template, options);
        const policies = parseAllDocuments(rendered).map((document) => document.toJSON());

        expect(policies.map((policy) => policy.metadata.name)).toEqual([
            'agenthub-server-signed-by-protected-master',
            'agenthub-server-migration-signed-by-protected-master',
            'agenthub-app-signed-by-protected-master',
        ]);
        for (const policy of policies) {
            expect(policy.apiVersion).toBe('policy.sigstore.dev/v1alpha1');
            expect(policy.kind).toBe('ClusterImagePolicy');
            expect(policy.spec.mode).toBe('enforce');
            expect(policy.spec.authorities).toHaveLength(1);
            expect(policy.spec.authorities[0]).toMatchObject({
                name: 'protected-master-keyless',
                signatureFormat: 'bundle',
                keyless: {
                    url: 'https://fulcio.sigstore.dev',
                    identities: [{
                        issuer: options.certificateIssuer,
                        subject: options.certificateIdentity,
                    }],
                },
                ctlog: { url: 'https://rekor.sigstore.dev' },
                attestations: [{
                    name: 'require-cosign-v3-image-signature',
                    predicateType: 'https://sigstore.dev/cosign/sign/v1',
                }],
            });
        }
        expect(policies[0].spec.images).toEqual([
            { glob: `${options.registryPrefix}/agenthub-server@sha256:*` },
        ]);
        expect(policies[1].spec.images).toEqual([
            { glob: `${options.registryPrefix}/agenthub-server-migration@sha256:*` },
        ]);
        expect(policies[2].spec.images).toEqual([
            { glob: `${options.registryPrefix}/agenthub-app@sha256:*` },
        ]);
        expect(rendered).not.toMatch(/__[A-Z0-9_]+__/);
        expect(rendered).not.toContain('subjectRegExp');
        expect(rendered).not.toContain('issuerRegExp');
        expect(rendered).not.toContain('glob: "**"');
    });

    it.each([
        { registryPrefix: 'https://registry.example.invalid/artsum' },
        { registryPrefix: 'registry.example.invalid/artsum/' },
        { registryPrefix: 'registry.example.invalid/../artsum' },
        { certificateIdentity: 'https://gitlab.example.invalid/artsum/agenthub//.gitlab-ci.yml@refs/heads/main' },
        { certificateIdentity: '.*' },
        { certificateIssuer: 'http://gitlab.example.invalid' },
        { certificateIssuer: 'https://gitlab.example.invalid/' },
    ])('rejects an unsafe signature policy option: %o', (override) => {
        expect(validateSignedImagePolicyOptions({ ...options, ...override })).not.toEqual([]);
    });

    it('rejects an image outside the signed registry prefix', async () => {
        await expect(runSignedKubernetesRelease({
            ...options,
            image: `other.example.invalid/artsum/agenthub-app@sha256:${digest}`,
        }, { runner: vi.fn() })).rejects.toThrow(/registryPrefix/);
    });

    it('keeps private registry credentials external and mounts only the generated pull secret', () => {
        const externalSecret = parseAllDocuments(readFileSync(registrySecretPath, 'utf8'))[0].toJSON();
        const server = parseAllDocuments(readFileSync(serverManifestPath, 'utf8'))
            .map((document) => document.toJSON())
            .find((document) => document?.kind === 'Deployment' && document?.metadata?.name === 'agenthub-server');
        const web = parseAllDocuments(readFileSync(webManifestPath, 'utf8'))
            .map((document) => document.toJSON())
            .find((document) => document?.kind === 'Deployment' && document?.metadata?.name === 'agenthub-app');

        expect(externalSecret).toMatchObject({
            apiVersion: 'external-secrets.io/v1',
            kind: 'ExternalSecret',
            metadata: { name: 'agenthub-registry' },
            spec: {
                secretStoreRef: { name: 'vault-backend', kind: 'SecretStore' },
                target: {
                    name: 'agenthub-registry',
                    creationPolicy: 'Owner',
                    deletionPolicy: 'Retain',
                    template: {
                        engineVersion: 'v2',
                        type: 'kubernetes.io/dockerconfigjson',
                    },
                },
                data: [{
                    secretKey: 'dockerconfigjson',
                    remoteRef: {
                        key: '/agenthub-registry',
                        property: 'dockerconfigjson',
                        decodingStrategy: 'None',
                    },
                }],
            },
        });
        expect(externalSecret.spec.target.template.data['.dockerconfigjson']).toContain('.dockerconfigjson');
        expect(server.spec.template.spec.imagePullSecrets).toEqual([{ name: 'agenthub-registry' }]);
        expect(web.spec.template.spec.imagePullSecrets).toEqual([{ name: 'agenthub-registry' }]);
        expect(readFileSync(registrySecretPath, 'utf8')).not.toMatch(/password:|auth:\s+[A-Za-z0-9+/=]{16,}/);
    });

    it('fails before every Kubernetes mutation when the exact image signature is invalid', async () => {
        const calls: Array<{ executable: string; argv: string[] }> = [];
        const runner = vi.fn(async (executable: string, argv: string[]) => {
            calls.push({ executable, argv });
            if (executable === 'cosign') throw new Error('signature mismatch');
            return { stdout: '', stderr: '', exitCode: 0 };
        });

        await expect(runSignedKubernetesRelease({ ...options, apply: true }, { runner }))
            .rejects.toThrow(/signature mismatch/);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            executable: 'cosign',
            argv: [
                'verify',
                '--certificate-identity', options.certificateIdentity,
                '--certificate-oidc-issuer', options.certificateIssuer,
                '--output', 'json',
                image,
            ],
        });
    });

    it('requires a distinct exact migration digest for Server releases and rejects it for Web releases', async () => {
        const serverOptions = {
            ...options,
            component: 'server' as const,
            image: serverImage,
            manifestOutput: '/tmp/agenthub-server.yaml',
        };
        await expect(runSignedKubernetesRelease(serverOptions, { runner: vi.fn() }))
            .rejects.toThrow(/migrationImage/);
        await expect(runSignedKubernetesRelease({
            ...options,
            migrationImage,
            migrationManifestOutput: '/tmp/agenthub-migration.yaml',
            migrationLogOutput: '/tmp/agenthub-migration.log',
        }, { runner: vi.fn() })).rejects.toThrow(/only valid for server/);
    });

    it('verifies and completes a hardened one-shot migration before applying the Server Deployment', async () => {
        const calls: string[] = [];
        const runner = vi.fn(async (executable: string, argv: string[]) => {
            calls.push([executable, ...argv].join(' '));
            if (executable === 'cosign') {
                const target = argv.at(-1);
                const claimed = target === migrationImage ? migrationDigest : digest;
                return { stdout: JSON.stringify([{ critical: { image: { 'docker-manifest-digest': `sha256:${claimed}` } } }]), stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'get' && argv[1] === 'secret/agenthub-registry') {
                return { stdout: 'kubernetes.io/dockerconfigjson', stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'get' && argv[1] === 'deployment/agenthub-server') {
                throw new Error('not found');
            }
            if (argv[0] === 'create' && argv.includes('/tmp/agenthub-migration.yaml')) {
                return { stdout: 'job.batch/agenthub-server-migration-k9z2m\n', stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'logs') return { stdout: '45 migrations applied\n', stderr: '', exitCode: 0 };
            if (argv[0] === 'get' && argv[1] === 'deployment/agenthub-server') {
                return { stdout: `${serverImage}\n`, stderr: '', exitCode: 0 };
            }
            return { stdout: '', stderr: '', exitCode: 0 };
        });
        let deploymentRead = 0;
        runner.mockImplementation(async (executable: string, argv: string[]) => {
            calls.push([executable, ...argv].join(' '));
            if (executable === 'cosign') {
                const target = argv.at(-1);
                const claimed = target === migrationImage ? migrationDigest : digest;
                return { stdout: JSON.stringify([{ critical: { image: { 'docker-manifest-digest': `sha256:${claimed}` } } }]), stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'get' && argv[1] === 'secret/agenthub-registry') return { stdout: 'kubernetes.io/dockerconfigjson', stderr: '', exitCode: 0 };
            if (argv[0] === 'get' && argv[1] === 'deployment/agenthub-server') {
                deploymentRead += 1;
                if (deploymentRead === 1) throw new Error('not found');
                return { stdout: `${serverImage}\n`, stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'create') return { stdout: 'job.batch/agenthub-server-migration-k9z2m\n', stderr: '', exitCode: 0 };
            if (argv[0] === 'logs') return { stdout: '45 migrations applied\n', stderr: '', exitCode: 0 };
            return { stdout: '', stderr: '', exitCode: 0 };
        });

        await expect(runSignedKubernetesRelease({
            ...options,
            component: 'server',
            image: serverImage,
            migrationImage,
            manifestOutput: '/tmp/agenthub-server.yaml',
            migrationManifestOutput: '/tmp/agenthub-migration.yaml',
            migrationLogOutput: '/tmp/agenthub-migration.log',
            reportOutput: '/tmp/agenthub-server.release.json',
            apply: true,
        }, { runner })).resolves.toMatchObject({ status: 'ready', migrationJob: 'agenthub-server-migration-k9z2m' });

        expect(readFileSync(migrationTemplatePath, 'utf8')).toContain('kind: Job');
        const verifyMigration = calls.findIndex((call) => call.endsWith(` ${migrationImage}`));
        const migrationDryRun = calls.findIndex((call) => call.includes('apply --server-side --dry-run=server') && call.includes('/tmp/agenthub-migration.yaml'));
        const secretsReady = calls.findIndex((call) => call.includes('wait --for=condition=Ready externalsecret/agenthub-secrets'));
        const migrationCreate = calls.findIndex((call) => call.includes('create') && call.includes('/tmp/agenthub-migration.yaml'));
        const migrationWait = calls.findIndex((call) => call.includes('wait --for=condition=Complete job/agenthub-server-migration-k9z2m'));
        const migrationLogs = calls.findIndex((call) => call.includes('logs job/agenthub-server-migration-k9z2m'));
        const workloadApply = calls.findIndex((call) => !call.includes('--dry-run=server') && call.includes('/tmp/agenthub-server.yaml'));
        expect(verifyMigration).toBeGreaterThan(-1);
        expect(migrationDryRun).toBeGreaterThan(verifyMigration);
        expect(secretsReady).toBeGreaterThan(migrationDryRun);
        expect(migrationCreate).toBeGreaterThan(migrationDryRun);
        expect(migrationCreate).toBeGreaterThan(secretsReady);
        expect(migrationWait).toBeGreaterThan(migrationCreate);
        expect(migrationLogs).toBeGreaterThan(migrationWait);
        expect(workloadApply).toBeGreaterThan(migrationLogs);
    });

    it('stops before Deployment apply and records logs when migration readiness fails', async () => {
        const calls: string[] = [];
        const runner = vi.fn(async (executable: string, argv: string[]) => {
            calls.push([executable, ...argv].join(' '));
            if (executable === 'cosign') {
                const claimed = argv.at(-1) === migrationImage ? migrationDigest : digest;
                return { stdout: JSON.stringify([{ critical: { image: { 'docker-manifest-digest': `sha256:${claimed}` } } }]), stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'get' && argv[1] === 'secret/agenthub-registry') return { stdout: 'kubernetes.io/dockerconfigjson', stderr: '', exitCode: 0 };
            if (argv[0] === 'create') return { stdout: 'job.batch/agenthub-server-migration-fail1\n', stderr: '', exitCode: 0 };
            if (argv[0] === 'wait' && argv.includes('job/agenthub-server-migration-fail1')) throw new Error('job failed');
            if (argv[0] === 'logs') return { stdout: 'migration failure\n', stderr: '', exitCode: 0 };
            return { stdout: '', stderr: '', exitCode: 0 };
        });

        await expect(runSignedKubernetesRelease({
            ...options,
            component: 'server',
            image: serverImage,
            migrationImage,
            manifestOutput: '/tmp/agenthub-server-failed.yaml',
            migrationManifestOutput: '/tmp/agenthub-migration-failed.yaml',
            migrationLogOutput: '/tmp/agenthub-migration-failed.log',
            reportOutput: '/tmp/agenthub-server-failed.release.json',
            apply: true,
        }, { runner })).rejects.toThrow(/migration failed/i);
        expect(calls.some((call) => !call.includes('--dry-run=server') && call.includes('/tmp/agenthub-server-failed.yaml'))).toBe(false);
        expect(calls.some((call) => call.includes('delete job/agenthub-server-migration-fail1'))).toBe(true);
        expect(readFileSync('/tmp/agenthub-migration-failed.log', 'utf8')).toBe('migration failure\n');
        expect(JSON.parse(readFileSync('/tmp/agenthub-server-failed.release.json', 'utf8'))).toMatchObject({
            status: 'migration-failed',
            migrationImage,
            migrationJob: 'agenthub-server-migration-fail1',
        });
    });

    it('rolls back to the exact previous digest when rollout readiness fails', async () => {
        const previous = `registry.example.invalid/artsum/agenthub-app@sha256:${'b'.repeat(64)}`;
        const calls: string[] = [];
        let rolloutCount = 0;
        const runner = vi.fn(async (executable: string, argv: string[]) => {
            calls.push([executable, ...argv].join(' '));
            if (executable === 'cosign') return {
                stdout: JSON.stringify([{ critical: { image: { 'docker-manifest-digest': `sha256:${digest}` } } }]),
                stderr: '',
                exitCode: 0,
            };
            if (argv[0] === 'get' && argv[1] === 'secret/agenthub-registry') {
                return { stdout: 'kubernetes.io/dockerconfigjson', stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'get') return { stdout: `${previous}\n`, stderr: '', exitCode: 0 };
            if (argv[0] === 'rollout' && argv[1] === 'status') {
                rolloutCount += 1;
                if (rolloutCount === 1) throw new Error('progress deadline exceeded');
            }
            return { stdout: '', stderr: '', exitCode: 0 };
        });

        await expect(runSignedKubernetesRelease({ ...options, apply: true }, { runner }))
            .rejects.toThrow(/rolled back.*progress deadline exceeded/i);
        const policyWait = calls.findIndex((call) => call.includes('clusterimagepolicy/agenthub-app-signed-by-protected-master'));
        const migrationPolicyWait = calls.findIndex((call) => call.includes('clusterimagepolicy/agenthub-server-migration-signed-by-protected-master'));
        const registrySecretApply = calls.findIndex((call) => !call.includes('--dry-run=server') && call.includes('agenthub-registry-external-secret.yaml'));
        const registrySecretWait = calls.findIndex((call) => call.includes('wait --for=condition=Ready externalsecret/agenthub-registry'));
        const registrySecretType = calls.findIndex((call) => call.includes('get secret/agenthub-registry') && call.includes('jsonpath={.type}'));
        const workloadDryRun = calls.findIndex((call) => call.includes('--dry-run=server') && call.includes(options.manifestOutput));
        const workloadApply = calls.findIndex((call) => !call.includes('--dry-run=server') && call.includes(options.manifestOutput));
        expect(policyWait).toBeGreaterThan(-1);
        expect(migrationPolicyWait).toBeGreaterThan(-1);
        expect(registrySecretApply).toBeGreaterThan(policyWait);
        expect(registrySecretWait).toBeGreaterThan(registrySecretApply);
        expect(registrySecretType).toBeGreaterThan(registrySecretWait);
        expect(workloadDryRun).toBeGreaterThan(registrySecretApply);
        expect(workloadDryRun).toBeGreaterThan(registrySecretType);
        expect(workloadDryRun).toBeGreaterThan(policyWait);
        expect(workloadApply).toBeGreaterThan(workloadDryRun);
        expect(calls).toEqual(expect.arrayContaining([
            expect.stringContaining('kubectl rollout undo deployment/agenthub-app'),
            expect.stringContaining('kubectl rollout status deployment/agenthub-app'),
        ]));
        expect(calls.at(-1)).toContain('kubectl get deployment/agenthub-app');
    });

    it('waits through a stale progress deadline after rollback before verifying the restored digest', async () => {
        const previous = `registry.example.invalid/artsum/agenthub-app@sha256:${'b'.repeat(64)}`;
        let rolloutCount = 0;
        const sleep = vi.fn(async () => {});
        const runner = vi.fn(async (executable: string, argv: string[]) => {
            if (executable === 'cosign') return {
                stdout: JSON.stringify([{ critical: { image: { 'docker-manifest-digest': `sha256:${digest}` } } }]),
                stderr: '',
                exitCode: 0,
            };
            if (argv[0] === 'get' && argv[1] === 'secret/agenthub-registry') {
                return { stdout: 'kubernetes.io/dockerconfigjson', stderr: '', exitCode: 0 };
            }
            if (argv[0] === 'get') return { stdout: `${previous}\n`, stderr: '', exitCode: 0 };
            if (argv[0] === 'rollout' && argv[1] === 'status') {
                rolloutCount += 1;
                if (rolloutCount === 1) throw new Error('progress deadline exceeded');
                if (rolloutCount === 2) throw new Error('deployment exceeded its progress deadline');
            }
            return { stdout: '', stderr: '', exitCode: 0 };
        });

        await expect(runSignedKubernetesRelease(
            { ...options, apply: true },
            { runner, sleep },
        )).rejects.toThrow(/rolled back.*progress deadline exceeded/i);
        expect(rolloutCount).toBe(3);
        expect(sleep).toHaveBeenCalled();
    });

    it('keeps registry credentials off argv and requires protected master image build/sign/deploy jobs', () => {
        const ci = readFileSync(ciPath, 'utf8');

        expect(ci).toContain('container:build-and-sign:server:');
        expect(ci).toContain('container:build-and-sign:server-migration:');
        expect(ci).toContain('container:build-and-sign:web:');
        expect(ci).toContain('release:deploy:server:');
        expect(ci).toContain('release:deploy:web:');
        expect(ci).toContain('$CI_COMMIT_BRANCH == "master" && $CI_COMMIT_REF_PROTECTED == "true"');
        expect(ci).toContain('printf \'%s\' "$CI_JOB_TOKEN" | docker login --username gitlab-ci-token --password-stdin "$CI_REGISTRY"');
        expect(ci).not.toMatch(/docker login[^\n]*(?:-p|--password)\s+\$CI_JOB_TOKEN/);
        expect(ci).toContain('cosign sign');
        expect(ci).toContain('cosign verify');
        expect(ci).toContain('AGENTHUB_DOCKER_TARGET: runner');
        expect(ci).toContain('AGENTHUB_DOCKER_TARGET: migration');
        expect(ci).toContain('AGENTHUB_MIGRATION_RELEASE_IMAGE: $SERVER_MIGRATION_RELEASE_IMAGE');
        expect(ci).toContain('--migration-image "$AGENTHUB_MIGRATION_RELEASE_IMAGE"');
        expect(ci).toContain('job: container:build-and-sign:server-migration');
        expect(ci).toContain('docker build --pull --target "$AGENTHUB_DOCKER_TARGET"');
        expect(ci).toContain('scripts/runSignedKubernetesRelease.cjs');
        expect(ci).toContain('when: manual');
        expect(ci).toContain('environment: production');
        expect(ci).toContain('tags:\n    - protected-release');
        expect(ci).toContain('docker:27.5.1-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c');
        expect(ci).toContain('docker:27.5.1-dind@sha256:aa3df78ecf320f5fafdce71c659f1629e96e9de0968305fe1de670e0ca9176ce');
    });
});
