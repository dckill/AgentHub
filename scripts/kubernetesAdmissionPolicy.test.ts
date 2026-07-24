import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

import {
    renderKubernetesRelease,
    renderWebKubernetesRelease,
    validateAgentHubDeployment,
    validateAgentHubWebDeployment,
} from './renderKubernetesRelease.cjs';

const repoRoot = resolve(__dirname, '..');
const deploymentPath = resolve(repoRoot, 'packages/agenthub-server/deploy/base/agenthub.yaml');
const webDeploymentPath = resolve(repoRoot, 'packages/agenthub-app/deploy/agenthub-app.yaml');
const localOverlayPaths = [
    'grafana.yaml',
    'minio.yaml',
    'postgres.yaml',
    'prometheus.yaml',
].map((file) => resolve(repoRoot, 'packages/agenthub-server/deploy/overlays/local', file));
const baseKustomizationPath = resolve(repoRoot, 'packages/agenthub-server/deploy/base/kustomization.yaml');
const localIntegrationPath = resolve(repoRoot, 'packages/agenthub-server/deploy/integration-tests/local.sh');
const policyPath = resolve(repoRoot, 'packages/agenthub-server/deploy/policies/require-immutable-agenthub-images.yaml');
const migrationJobPath = resolve(repoRoot, 'packages/agenthub-server/deploy/agenthub-migration-job.yaml');
const releaseSkillPath = resolve(repoRoot, '.agents/skills/release/SKILL.md');
const releaseImage = `registry.example.invalid/artsum/agenthub-server@sha256:${'a'.repeat(64)}`;
const webReleaseImage = `registry.example.invalid/artsum/agenthub-app@sha256:${'b'.repeat(64)}`;
const imageSentinel = `agenthub-server@sha256:${'0'.repeat(64)}`;
const webImageSentinel = `agenthub-app@sha256:${'0'.repeat(64)}`;

function deploymentFrom(yaml: string, name = 'agenthub-server'): any {
    return parseAllDocuments(yaml)
        .map((document) => document.toJSON())
        .find((document) => document?.kind === 'Deployment' && document?.metadata?.name === name);
}

describe('Kubernetes immutable image admission boundary', () => {
    it('pins every checked-in local overlay workload image by sha256 digest', () => {
        const imagePattern = /@sha256:[0-9a-f]{64}$/;
        const images = localOverlayPaths.flatMap((file) => parseAllDocuments(readFileSync(file, 'utf8'))
            .map((document) => document.toJSON())
            .filter((document) => ['Deployment', 'StatefulSet', 'DaemonSet'].includes(document?.kind))
            .flatMap((workload) => [
                ...(workload.spec.template.spec.initContainers ?? []),
                ...(workload.spec.template.spec.containers ?? []),
            ].map((container) => `${workload.metadata.name}/${container.name}=${container.image}`)));

        expect(images.length).toBeGreaterThan(0);
        expect(images.filter((entry) => !imagePattern.test(entry.split('=').at(-1) ?? ''))).toEqual([]);
    });

    it('keeps the default Kustomize load restrictor enabled for the local overlay', () => {
        const base = parseAllDocuments(readFileSync(baseKustomizationPath, 'utf8'))[0].toJSON();
        const integration = readFileSync(localIntegrationPath, 'utf8');

        expect(base.resources).toEqual(['agenthub.yaml', 'agenthub-secrets-external-secret.yaml']);
        expect(base.resources.every((resource: string) => !resource.startsWith('/') && !resource.split('/').includes('..'))).toBe(true);
        expect(integration).toContain('kubectl kustomize "$OVERLAY" | kubectl apply -f -');
        expect(integration).not.toContain('LoadRestrictionsNone');
    });

    it('keeps the production template digest-only and disables the Pod service-account token', () => {
        const source = readFileSync(deploymentPath, 'utf8');
        const deployment = deploymentFrom(source);
        const podSpec = deployment.spec.template.spec;

        expect(podSpec.containers[0].image).toBe(imageSentinel);
        expect(podSpec.automountServiceAccountToken).toBe(false);
        expect(source).not.toContain('agenthub-server:{version}');
    });

    it('gates server cold starts on Postgres and Redis without weakening the Pod boundary', () => {
        const deployment = deploymentFrom(readFileSync(deploymentPath, 'utf8'));
        const init = deployment.spec.template.spec.initContainers;

        expect(init).toHaveLength(1);
        expect(init[0]).toMatchObject({
            name: 'wait-for-dependencies',
            image: 'busybox:1.37.0-musl@sha256:222ad6d973c0d198014546a65cd02c5fdedcc172123c5b4c2bf0af636550bd94',
            command: ['sh', '-ec'],
            securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
            },
        });
        expect(init[0].args.join('\n')).toContain('agenthub-postgres 5432');
        expect(init[0].args.join('\n')).toContain('agenthub-redis 6379');
    });

    it('ships a fail-closed admission policy for every agenthub-server Pod image source', () => {
        const documents = parseAllDocuments(readFileSync(policyPath, 'utf8'))
            .map((document) => document.toJSON());
        const policy = documents.find((document) => document.kind === 'ValidatingAdmissionPolicy');
        const binding = documents.find((document) => document.kind === 'ValidatingAdmissionPolicyBinding');
        const expressions = policy.spec.validations.map((validation: any) => validation.expression).join('\n');
        const messages = policy.spec.validations.map((validation: any) => validation.message).join('\n');

        expect(policy.spec.failurePolicy).toBe('Fail');
        expect(policy.spec.matchConstraints.resourceRules).toEqual(expect.arrayContaining([
            expect.objectContaining({
                apiGroups: ['apps'],
                apiVersions: ['v1'],
                operations: ['CREATE', 'UPDATE'],
                resources: ['deployments', 'statefulsets'],
            }),
            expect.objectContaining({
                apiGroups: ['batch'],
                apiVersions: ['v1'],
                operations: ['CREATE', 'UPDATE'],
                resources: ['jobs'],
            }),
        ]));
        expect(policy.spec.matchConditions.map((condition: any) => condition.expression).join('\n'))
            .toContain("object.metadata.name.startsWith('agenthub-')");
        expect(expressions).toContain('containers.all');
        expect(expressions).toContain('initContainers');
        expect(expressions).toContain('ephemeralContainers');
        expect(expressions).toContain("@sha256:[0-9a-f]{64}$");
        expect(expressions).toContain('0000000000000000000000000000000000000000000000000000000000000000');
        expect(expressions).toContain('automountServiceAccountToken == false');
        expect(messages).toContain('AgentHub workload initContainer must deny privilege escalation');
        expect(messages).toContain('AgentHub workload ephemeralContainer must deny privilege escalation');
        expect(binding.spec.policyName).toBe(policy.metadata.name);
        expect(binding.spec.validationActions).toContain('Deny');
    });

    it('ships a hardened one-shot migration Job template with no credential literals', () => {
        const source = readFileSync(migrationJobPath, 'utf8');
        const job = parseAllDocuments(source)[0].toJSON();
        const pod = job.spec.template.spec;
        const container = pod.containers[0];

        expect(job).toMatchObject({ apiVersion: 'batch/v1', kind: 'Job' });
        expect(job.metadata.generateName).toBe('agenthub-server-migration-');
        expect(job.spec).toMatchObject({ backoffLimit: 0, ttlSecondsAfterFinished: 86400 });
        expect(pod).toMatchObject({
            automountServiceAccountToken: false,
            restartPolicy: 'Never',
            imagePullSecrets: [{ name: 'agenthub-registry' }],
            securityContext: {
                runAsNonRoot: true,
                runAsUser: 10001,
                runAsGroup: 10001,
                seccompProfile: { type: 'RuntimeDefault' },
            },
        });
        expect(container.image).toBe(`agenthub-server-migration@sha256:${'0'.repeat(64)}`);
        expect(container.envFrom).toEqual([{ secretRef: { name: 'agenthub-secrets' } }]);
        expect(container.securityContext).toMatchObject({
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: true,
            capabilities: { drop: ['ALL'] },
        });
        expect(source).not.toMatch(/DATABASE_URL:\s*[^$\n]|password:\s*\S|api[_-]?key:\s*\S|token:\s*(?!false\b)\S/i);
    });

    it('pins every non-template image in the production workload set and hardens Redis', () => {
        const documents = parseAllDocuments(readFileSync(deploymentPath, 'utf8')).map((document) => document.toJSON());
        const workloads = documents.filter((document) => ['Deployment', 'StatefulSet'].includes(document?.kind));
        const images = workloads.flatMap((workload) => workload.spec.template.spec.containers.map((container: any) => container.image));
        const redis = workloads.find((workload) => workload.metadata.name === 'agenthub-redis');

        expect(images).toContain('redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99');
        expect(images).toContain('oliver006/redis_exporter:v1.67.0-alpine@sha256:ef9e3c9afa9072b8a4db8bc2b01471cd582a6a1db23760bc5fdb9e3c21842205');
        expect(images.filter((image) => image !== imageSentinel).every((image) => /@sha256:[0-9a-f]{64}$/.test(image))).toBe(true);
        expect(redis.spec.template.spec).toMatchObject({
            automountServiceAccountToken: false,
            securityContext: {
                runAsNonRoot: true,
                fsGroup: 1000,
                fsGroupChangePolicy: 'OnRootMismatch',
                seccompProfile: { type: 'RuntimeDefault' },
            },
        });
        const [redisContainer, exporterContainer] = redis.spec.template.spec.containers;
        expect(redisContainer.securityContext).toMatchObject({ runAsUser: 999, runAsGroup: 1000 });
        expect(exporterContainer.securityContext).toMatchObject({ runAsUser: 59000, runAsGroup: 59000 });
        for (const container of [redisContainer, exporterContainer]) {
            expect(container.securityContext).toMatchObject({
                allowPrivilegeEscalation: false,
                capabilities: { drop: ['ALL'] },
            });
        }
    });

    it('renders an exact immutable image and leaves no release placeholder behind', () => {
        const source = readFileSync(deploymentPath, 'utf8');
        const rendered = renderKubernetesRelease(source, releaseImage);
        const deployment = deploymentFrom(rendered);

        expect(deployment.spec.template.spec.containers[0].image).toBe(releaseImage);
        expect(rendered).not.toMatch(/\{(?:digest|version|image)\}/);
        expect(validateAgentHubDeployment(deployment)).toEqual([]);
    });

    it.each([
        'registry.example.invalid/artsum/agenthub-server:1.0.3',
        'registry.example.invalid/artsum/agenthub-server@sha256:short',
        `https://registry.example.invalid/artsum/agenthub-server@sha256:${'a'.repeat(64)}`,
        `registry.example.invalid/artsum/other@sha256:${'a'.repeat(64)}`,
        `registry.example.invalid/artsum/agenthub-server@sha256:${'A'.repeat(64)}`,
    ])('rejects a mutable or invalid release image: %s', (image) => {
        const source = readFileSync(deploymentPath, 'utf8');
        expect(() => renderKubernetesRelease(source, image)).toThrow(/immutable AgentHub Server image/);
    });

    it('rejects mutable sidecars, init containers, token mounts and weakened security contexts', () => {
        const deployment = deploymentFrom(renderKubernetesRelease(readFileSync(deploymentPath, 'utf8'), releaseImage));
        deployment.spec.template.spec.containers.push({ name: 'mutable-sidecar', image: 'busybox:latest' });
        deployment.spec.template.spec.initContainers = [{ name: 'mutable-init', image: 'busybox:latest' }];
        deployment.spec.template.spec.automountServiceAccountToken = true;
        deployment.spec.template.spec.securityContext.runAsNonRoot = false;
        deployment.spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation = true;
        deployment.spec.template.spec.containers[0].securityContext.capabilities.drop = [];

        expect(validateAgentHubDeployment(deployment)).toEqual(expect.arrayContaining([
            expect.stringContaining('mutable-sidecar'),
            expect.stringContaining('mutable-init'),
            expect.stringContaining('automountServiceAccountToken'),
            expect.stringContaining('runAsNonRoot'),
            expect.stringContaining('allowPrivilegeEscalation'),
            expect.stringContaining('drop ALL'),
        ]));
    });

    it('ships the Web template with an immutable sentinel, the real Nginx port and a read-only non-root Pod', () => {
        const source = readFileSync(webDeploymentPath, 'utf8');
        const documents = parseAllDocuments(source).map((document) => document.toJSON());
        const deployment = documents.find((document) => document?.kind === 'Deployment' && document?.metadata?.name === 'agenthub-app');
        const service = documents.find((document) => document?.kind === 'Service' && document?.metadata?.name === 'agenthub-app');
        const podSpec = deployment.spec.template.spec;
        const container = podSpec.containers[0];

        expect(container.image).toBe(webImageSentinel);
        expect(source).not.toContain('{version}');
        expect(podSpec).toMatchObject({
            automountServiceAccountToken: false,
            securityContext: {
                runAsNonRoot: true,
                runAsUser: 101,
                runAsGroup: 101,
                seccompProfile: { type: 'RuntimeDefault' },
            },
        });
        expect(container).toMatchObject({
            imagePullPolicy: 'IfNotPresent',
            ports: [{ name: 'http', containerPort: 8080, protocol: 'TCP' }],
            securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
            },
        });
        expect(container.livenessProbe.httpGet.port).toBe('http');
        expect(container.readinessProbe.httpGet.port).toBe('http');
        expect(container.startupProbe.httpGet.port).toBe('http');
        expect(service.spec.ports[0]).toMatchObject({ port: 3000, targetPort: 'http' });
        expect(container.volumeMounts.map((mount: any) => mount.mountPath)).toEqual(expect.arrayContaining([
            '/var/cache/nginx',
            '/var/log/nginx',
            '/run',
        ]));
    });

    it('renders and validates the exact immutable Web image without weakening the shared admission contract', () => {
        const rendered = renderWebKubernetesRelease(readFileSync(webDeploymentPath, 'utf8'), webReleaseImage);
        const deployment = deploymentFrom(rendered, 'agenthub-app');

        expect(deployment.spec.template.spec.containers[0].image).toBe(webReleaseImage);
        expect(rendered).not.toMatch(/\{(?:digest|version|image)\}/);
        expect(validateAgentHubWebDeployment(deployment)).toEqual([]);
    });

    it.each([
        'registry.example.invalid/artsum/agenthub-app:1.0.0',
        'registry.example.invalid/artsum/agenthub-app@sha256:short',
        `https://registry.example.invalid/artsum/agenthub-app@sha256:${'b'.repeat(64)}`,
        `registry.example.invalid/artsum/other@sha256:${'b'.repeat(64)}`,
        `registry.example.invalid/artsum/agenthub-app@sha256:${'B'.repeat(64)}`,
        `registry.example.invalid/artsum/agenthub-app@sha256:${'0'.repeat(64)}`,
    ])('rejects a mutable or invalid Web release image: %s', (image) => {
        expect(() => renderWebKubernetesRelease(readFileSync(webDeploymentPath, 'utf8'), image))
            .toThrow(/immutable AgentHub Web image/);
    });

    it('keeps the repository release skill on protected GitLab/master and the signed release path', () => {
        const skill = readFileSync(releaseSkillPath, 'utf8');

        expect(skill).not.toMatch(/TeamCity|Lab_AgentHub|handy-server|docker\.korshakov\.com@|deploy@artsum/);
        expect(skill).toContain('GitLab');
        expect(skill).toContain('master');
        expect(skill).toContain('scripts/runSignedKubernetesRelease.cjs');
        expect(skill).toContain('--component web');
        expect(skill).toContain('--component server');
        expect(skill).toContain('External Secrets stable `external-secrets.io/v1`');
        expect(skill).toContain('exact previous digest');
        expect(skill).toContain('packages/agenthub-app/deploy/agenthub-app.yaml');
        expect(skill).toContain('packages/agenthub-server/deploy/base/agenthub.yaml');
    });
});
