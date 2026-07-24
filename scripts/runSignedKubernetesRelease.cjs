#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseAllDocuments } = require('yaml');
const {
    renderKubernetesRelease,
    renderWebKubernetesRelease,
} = require('./renderKubernetesRelease.cjs');
const {
    atomicWrite,
    renderSignedImagePolicy,
    validateSignedImagePolicyOptions,
} = require('./renderSignedImagePolicy.cjs');

const componentConfig = {
    server: {
        deployment: 'agenthub-server',
        container: 'agenthub',
        template: '../packages/agenthub-server/deploy/base/agenthub.yaml',
        render: renderKubernetesRelease,
        migrationTemplate: '../packages/agenthub-server/deploy/agenthub-migration-job.yaml',
        secretsManifest: '../packages/agenthub-server/deploy/base/agenthub-secrets-external-secret.yaml',
    },
    web: {
        deployment: 'agenthub-app',
        container: 'agenthub-app',
        template: '../packages/agenthub-app/deploy/agenthub-app.yaml',
        render: renderWebKubernetesRelease,
    },
};

const zeroDigest = '0'.repeat(64);

function exactImagePattern(expectedName) {
    return new RegExp(`^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?(?:/[a-z0-9._-]+)*/${expectedName}@sha256:[0-9a-f]{64}$`);
}

function validateReleaseOptions(options) {
    const errors = validateSignedImagePolicyOptions(options);
    const config = componentConfig[options?.component];
    if (!config) errors.push('component must be server or web');
    const expectedName = options?.component === 'server' ? 'agenthub-server' : 'agenthub-app';
    if (!exactImagePattern(expectedName).test(options?.image ?? '')
        || (options?.image ?? '').endsWith(`@sha256:${zeroDigest}`)) {
        errors.push(`image must be an exact non-zero ${expectedName} sha256 digest reference`);
    }
    if (!(options?.image ?? '').startsWith(`${options?.registryPrefix ?? ''}/${expectedName}@sha256:`)) {
        errors.push(`image must belong to registryPrefix and end with ${expectedName}`);
    }
    if (!/^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(options?.namespace ?? '')
        || (options?.namespace ?? '').length > 63) {
        errors.push('namespace must be a DNS label');
    }
    if (!/^[1-9][0-9]{0,3}s$/.test(options?.timeout ?? '')) errors.push('timeout must be 1-9999 seconds');
    for (const field of ['manifestOutput', 'policyOutput']) {
        if (!options?.[field] || !path.isAbsolute(options[field])) errors.push(`${field} must be an absolute path`);
    }
    if (options?.reportOutput && !path.isAbsolute(options.reportOutput)) errors.push('reportOutput must be an absolute path');
    const migrationFields = ['migrationImage', 'migrationManifestOutput', 'migrationLogOutput'];
    if (options?.component === 'server') {
        if (!exactImagePattern('agenthub-server-migration').test(options?.migrationImage ?? '')
            || (options?.migrationImage ?? '').endsWith(`@sha256:${zeroDigest}`)) {
            errors.push('migrationImage must be an exact non-zero agenthub-server-migration sha256 digest reference');
        }
        if (!(options?.migrationImage ?? '').startsWith(`${options?.registryPrefix ?? ''}/agenthub-server-migration@sha256:`)) {
            errors.push('migrationImage must belong to registryPrefix and end with agenthub-server-migration');
        }
        for (const field of ['migrationManifestOutput', 'migrationLogOutput']) {
            if (!options?.[field] || !path.isAbsolute(options[field])) errors.push(`${field} must be an absolute path`);
        }
    } else if (migrationFields.some((field) => options?.[field] !== undefined)) {
        errors.push('migration options are only valid for server releases');
    }
    return errors;
}

function renderMigrationJob(template, image) {
    const sentinel = `agenthub-server-migration@sha256:${zeroDigest}`;
    if (!exactImagePattern('agenthub-server-migration').test(image)
        || image.endsWith(`@sha256:${zeroDigest}`)) {
        throw new Error('migration Job requires an exact non-zero agenthub-server-migration digest');
    }
    const occurrences = template.split(sentinel).length - 1;
    if (occurrences !== 1) throw new Error(`migration Job template must contain exactly one image sentinel, found ${occurrences}`);
    const rendered = template.replace(sentinel, image);
    const documents = parseAllDocuments(rendered);
    if (documents.length !== 1 || documents[0].errors.length > 0) throw new Error('migration Job template must be one valid YAML document');
    const job = documents[0].toJSON();
    const pod = job?.spec?.template?.spec;
    const container = pod?.containers?.[0];
    const valid = job?.apiVersion === 'batch/v1'
        && job?.kind === 'Job'
        && job?.metadata?.generateName === 'agenthub-server-migration-'
        && job?.spec?.backoffLimit === 0
        && job?.spec?.ttlSecondsAfterFinished === 86400
        && pod?.restartPolicy === 'Never'
        && pod?.automountServiceAccountToken === false
        && pod?.securityContext?.runAsNonRoot === true
        && pod?.securityContext?.seccompProfile?.type === 'RuntimeDefault'
        && container?.image === image
        && container?.securityContext?.allowPrivilegeEscalation === false
        && container?.securityContext?.readOnlyRootFilesystem === true
        && container?.securityContext?.capabilities?.drop?.includes('ALL')
        && container?.envFrom?.some((entry) => entry?.secretRef?.name === 'agenthub-secrets');
    if (!valid) throw new Error('migration Job template failed the hardened one-shot Job contract');
    return rendered;
}

function defaultRunner(executable, argv, options = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const child = spawn(executable, argv, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let outputError = null;
        const maxOutput = options.maxOutput ?? 4 * 1024 * 1024;
        const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
        const append = (current, chunk) => {
            const next = current + chunk.toString('utf8');
            if (Buffer.byteLength(next) > maxOutput) {
                throw new Error(`${executable} output exceeded ${maxOutput} bytes`);
            }
            return next;
        };
        const collect = (target, chunk) => {
            if (outputError) return target;
            try {
                return append(target, chunk);
            } catch (error) {
                outputError = error;
                child.kill('SIGTERM');
                return target;
            }
        };
        child.stdout.on('data', (chunk) => { stdout = collect(stdout, chunk); });
        child.stderr.on('data', (chunk) => { stderr = collect(stderr, chunk); });
        const timer = setTimeout(() => {
            outputError = new Error(`${executable} exceeded ${timeoutMs}ms timeout`);
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
        }, timeoutMs);
        timer.unref();
        child.once('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        });
        child.once('close', (exitCode, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (outputError) return reject(outputError);
            if (exitCode === 0) return resolve({ stdout, stderr, exitCode });
            reject(new Error(`${executable} exited ${exitCode ?? signal}: ${stderr || stdout}`.trim()));
        });
    });
}

function verifiedDigestFromCosign(output, expectedImage) {
    let signatures;
    try {
        signatures = JSON.parse(output);
    } catch {
        throw new Error('cosign verify did not return valid JSON');
    }
    if (!Array.isArray(signatures) || signatures.length === 0) {
        throw new Error('cosign verify returned no valid signatures');
    }
    const expectedDigest = expectedImage.slice(expectedImage.indexOf('@sha256:') + 1);
    for (const signature of signatures) {
        const claim = signature?.critical?.image?.['docker-manifest-digest'];
        if (claim && claim !== expectedDigest) throw new Error(`cosign claim digest ${claim} differs from ${expectedDigest}`);
    }
    return expectedDigest;
}

function reportPathFor(options) {
    return options.reportOutput ?? `${options.manifestOutput}.release.json`;
}

async function runSignedKubernetesRelease(options, dependencies = {}) {
    const errors = validateReleaseOptions(options);
    if (errors.length > 0) throw new Error(`Invalid signed Kubernetes release: ${errors.join('; ')}`);
    const runner = dependencies.runner ?? defaultRunner;
    const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    }));
    const kubectl = options.kubectlExecutable ?? 'kubectl';
    const cosign = options.cosignExecutable ?? 'cosign';
    const config = componentConfig[options.component];
    const startedAt = new Date().toISOString();

    const verified = await runner(cosign, [
        'verify',
        '--certificate-identity', options.certificateIdentity,
        '--certificate-oidc-issuer', options.certificateIssuer,
        '--output', 'json',
        options.image,
    ]);
    const verifiedDigest = verifiedDigestFromCosign(verified.stdout, options.image);
    let verifiedMigrationDigest = null;
    if (options.component === 'server') {
        const migrationVerified = await runner(cosign, [
            'verify',
            '--certificate-identity', options.certificateIdentity,
            '--certificate-oidc-issuer', options.certificateIssuer,
            '--output', 'json',
            options.migrationImage,
        ]);
        verifiedMigrationDigest = verifiedDigestFromCosign(migrationVerified.stdout, options.migrationImage);
    }

    const workloadTemplate = fs.readFileSync(path.resolve(__dirname, config.template), 'utf8');
    const manifest = config.render(workloadTemplate, options.image);
    const policyTemplate = fs.readFileSync(
        path.resolve(__dirname, '../packages/agenthub-server/deploy/policies/require-signed-agenthub-images.yaml'),
        'utf8',
    );
    const registrySecretManifest = path.resolve(
        __dirname,
        '../packages/agenthub-server/deploy/agenthub-registry-external-secret.yaml',
    );
    const serverSecretsManifest = options.component === 'server'
        ? path.resolve(__dirname, config.secretsManifest)
        : null;
    const policy = renderSignedImagePolicy(policyTemplate, options);
    atomicWrite(options.manifestOutput, manifest);
    atomicWrite(options.policyOutput, policy);
    if (options.component === 'server') {
        const migrationTemplate = fs.readFileSync(path.resolve(__dirname, config.migrationTemplate), 'utf8');
        atomicWrite(options.migrationManifestOutput, renderMigrationJob(migrationTemplate, options.migrationImage));
    }

    await runner(kubectl, ['apply', '--server-side', '--dry-run=server', '-f', options.policyOutput]);
    await runner(kubectl, [
        'apply', '--server-side', '--dry-run=server', '-n', options.namespace, '-f', registrySecretManifest,
    ]);
    if (options.component === 'server') {
        await runner(kubectl, [
            'apply', '--server-side', '--dry-run=server', '-n', options.namespace, '-f', serverSecretsManifest,
        ]);
        await runner(kubectl, [
            'apply', '--server-side', '--dry-run=server', '-n', options.namespace, '-f', options.migrationManifestOutput,
        ]);
    }

    if (!options.apply) {
        const included = (await runner(kubectl, [
            'get', 'namespace', options.namespace, '-o', 'jsonpath={.metadata.labels.policy\\.sigstore\\.dev/include}',
        ])).stdout.trim();
        if (included !== 'true') throw new Error(`Namespace ${options.namespace} is not opted into Sigstore policy admission`);
        await runner(kubectl, [
            'apply', '--server-side', '--dry-run=server', '-n', options.namespace, '-f', options.manifestOutput,
        ]);
        atomicWrite(reportPathFor(options), `${JSON.stringify({
            status: 'verified-dry-run',
            component: options.component,
            image: options.image,
            verifiedDigest,
            migrationImage: options.migrationImage ?? null,
            verifiedMigrationDigest,
            namespace: options.namespace,
            startedAt,
            completedAt: new Date().toISOString(),
        }, null, 2)}\n`);
        return { status: 'verified-dry-run', verifiedDigest };
    }

    await runner(kubectl, ['apply', '--server-side', '-f', options.policyOutput]);
    await runner(kubectl, [
        'label', 'namespace', options.namespace, 'policy.sigstore.dev/include=true', '--overwrite',
    ]);
    for (const policyName of [
        'agenthub-server-signed-by-protected-master',
        'agenthub-server-migration-signed-by-protected-master',
        'agenthub-app-signed-by-protected-master',
    ]) {
        await runner(kubectl, [
            'wait', '--for=condition=Ready', `clusterimagepolicy/${policyName}`, `--timeout=${options.timeout}`,
        ]);
    }
    await runner(kubectl, ['apply', '--server-side', '-n', options.namespace, '-f', registrySecretManifest]);
    await runner(kubectl, [
        'wait', '--for=condition=Ready', 'externalsecret/agenthub-registry', '-n', options.namespace, `--timeout=${options.timeout}`,
    ]);
    const registrySecretType = (await runner(kubectl, [
        'get', 'secret/agenthub-registry', '-n', options.namespace, '-o', 'jsonpath={.type}',
    ])).stdout.trim();
    if (registrySecretType !== 'kubernetes.io/dockerconfigjson') {
        throw new Error(`agenthub-registry secret has unexpected type ${registrySecretType || 'empty'}`);
    }
    if (options.component === 'server') {
        await runner(kubectl, ['apply', '--server-side', '-n', options.namespace, '-f', serverSecretsManifest]);
        await runner(kubectl, [
            'wait', '--for=condition=Ready', 'externalsecret/agenthub-secrets', '-n', options.namespace, `--timeout=${options.timeout}`,
        ]);
    }
    await runner(kubectl, [
        'apply', '--server-side', '--dry-run=server', '-n', options.namespace, '-f', options.manifestOutput,
    ]);

    const getImageArgs = [
        'get', `deployment/${config.deployment}`, '-n', options.namespace,
        '-o', `jsonpath={.spec.template.spec.containers[?(@.name==\"${config.container}\")].image}`,
    ];
    let previousImage = null;
    try {
        previousImage = (await runner(kubectl, getImageArgs)).stdout.trim() || null;
    } catch (error) {
        if (!/not found/i.test(String(error))) throw error;
    }

    let migrationJob = null;
    if (options.component === 'server') {
        const created = await runner(kubectl, [
            'create', '-n', options.namespace, '-f', options.migrationManifestOutput, '-o', 'name',
        ]);
        const match = created.stdout.trim().match(/^job\.batch\/(agenthub-server-migration-[a-z0-9-]{5,63})$/);
        if (!match || match[1].length > 63) {
            throw new Error(`kubectl create returned an invalid migration Job identity: ${created.stdout.trim() || 'empty'}`);
        }
        migrationJob = match[1];
        let migrationError = null;
        try {
            await runner(kubectl, [
                'wait', '--for=condition=Complete', `job/${migrationJob}`, '-n', options.namespace, `--timeout=${options.timeout}`,
            ]);
        } catch (error) {
            migrationError = error;
        }
        let migrationLogs = '';
        try {
            migrationLogs = (await runner(kubectl, [
                'logs', `job/${migrationJob}`, '-n', options.namespace, '--all-containers=true', '--timestamps=true',
            ], { maxOutput: 4 * 1024 * 1024 })).stdout;
        } catch (logError) {
            migrationLogs = `[migration logs unavailable] ${logError instanceof Error ? logError.message : String(logError)}\n`;
        }
        atomicWrite(options.migrationLogOutput, migrationLogs);
        if (migrationError) {
            let cleanupError = null;
            try {
                await runner(kubectl, [
                    'delete', `job/${migrationJob}`, '-n', options.namespace, '--wait=true', `--timeout=${options.timeout}`,
                ]);
            } catch (error) {
                cleanupError = error;
            }
            atomicWrite(reportPathFor(options), `${JSON.stringify({
                status: 'migration-failed',
                component: options.component,
                image: options.image,
                migrationImage: options.migrationImage,
                migrationJob,
                previousImage,
                verifiedDigest,
                verifiedMigrationDigest,
                namespace: options.namespace,
                startedAt,
                completedAt: new Date().toISOString(),
                error: migrationError instanceof Error ? migrationError.message : String(migrationError),
                cleanupError: cleanupError ? (cleanupError instanceof Error ? cleanupError.message : String(cleanupError)) : null,
            }, null, 2)}\n`);
            throw new Error(`Migration failed before Server rollout: ${migrationError instanceof Error ? migrationError.message : String(migrationError)}${cleanupError ? `; Job cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}` : ''}`);
        }
    }

    await runner(kubectl, ['apply', '--server-side', '-n', options.namespace, '-f', options.manifestOutput]);
    try {
        await runner(kubectl, [
            'rollout', 'status', `deployment/${config.deployment}`, '-n', options.namespace, `--timeout=${options.timeout}`,
        ]);
    } catch (rolloutError) {
        if (previousImage) {
            await runner(kubectl, ['rollout', 'undo', `deployment/${config.deployment}`, '-n', options.namespace]);
            const rollbackDeadline = Date.now() + (Number.parseInt(options.timeout, 10) * 1_000);
            for (;;) {
                try {
                    await runner(kubectl, [
                        'rollout', 'status', `deployment/${config.deployment}`, '-n', options.namespace, `--timeout=${options.timeout}`,
                    ]);
                    break;
                } catch (rollbackStatusError) {
                    if (!/progress deadline/i.test(String(rollbackStatusError))) throw rollbackStatusError;
                    const remaining = rollbackDeadline - Date.now();
                    if (remaining <= 0) {
                        throw new Error(`Rollback did not become ready within ${options.timeout}: ${rollbackStatusError instanceof Error ? rollbackStatusError.message : String(rollbackStatusError)}`);
                    }
                    await sleep(Math.min(500, remaining));
                }
            }
            const restored = (await runner(kubectl, getImageArgs)).stdout.trim();
            if (restored !== previousImage) {
                throw new Error(`Rollout failed and rollback restored ${restored || 'no image'} instead of ${previousImage}`);
            }
        } else {
            await runner(kubectl, [
                'delete', `deployment/${config.deployment}`, '-n', options.namespace, '--wait=true', `--timeout=${options.timeout}`,
            ]);
        }
        atomicWrite(reportPathFor(options), `${JSON.stringify({
            status: previousImage ? 'rolled-back' : 'failed-initial-rollout-removed',
            component: options.component,
            image: options.image,
            previousImage,
            verifiedDigest,
            migrationImage: options.migrationImage ?? null,
            verifiedMigrationDigest,
            migrationJob,
            namespace: options.namespace,
            startedAt,
            completedAt: new Date().toISOString(),
            error: rolloutError instanceof Error ? rolloutError.message : String(rolloutError),
        }, null, 2)}\n`);
        throw new Error(`${previousImage ? 'Rolled back' : 'Removed failed initial rollout'} after: ${rolloutError instanceof Error ? rolloutError.message : String(rolloutError)}`);
    }

    const deployedImage = (await runner(kubectl, getImageArgs)).stdout.trim();
    if (deployedImage !== options.image) throw new Error(`Rollout reported ready with unexpected image ${deployedImage}`);
    atomicWrite(reportPathFor(options), `${JSON.stringify({
        status: 'ready',
        component: options.component,
        image: options.image,
        previousImage,
        verifiedDigest,
        migrationImage: options.migrationImage ?? null,
        verifiedMigrationDigest,
        migrationJob,
        namespace: options.namespace,
        startedAt,
        completedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    return { status: 'ready', previousImage, verifiedDigest, migrationJob, verifiedMigrationDigest };
}

function parseArguments(argv) {
    const values = { apply: false };
    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index];
        if (current === '--apply') {
            values.apply = true;
            continue;
        }
        if (!current.startsWith('--')) throw new Error(`Unexpected argument: ${current}`);
        const name = current.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
        values[name] = value;
        index += 1;
    }
    return values;
}

if (require.main === module) {
    const values = parseArguments(process.argv.slice(2));
    runSignedKubernetesRelease({
        component: values.component,
        image: values.image,
        registryPrefix: values['registry-prefix'],
        certificateIdentity: values['certificate-identity'],
        certificateIssuer: values['certificate-issuer'],
        namespace: values.namespace,
        manifestOutput: values['manifest-output'],
        policyOutput: values['policy-output'],
        reportOutput: values['report-output'],
        migrationImage: values['migration-image'],
        migrationManifestOutput: values['migration-manifest-output'],
        migrationLogOutput: values['migration-log-output'],
        timeout: values.timeout ?? '120s',
        cosignExecutable: values.cosign ?? 'cosign',
        kubectlExecutable: values.kubectl ?? 'kubectl',
        apply: values.apply,
    }).then((result) => {
        process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    defaultRunner,
    renderMigrationJob,
    runSignedKubernetesRelease,
    validateReleaseOptions,
    verifiedDigestFromCosign,
};
