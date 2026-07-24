const fs = require('node:fs');
const path = require('node:path');
const { parseAllDocuments } = require('yaml');

const repositoryRoot = path.resolve(__dirname, '..');
const zeroDigest = '0'.repeat(64);
const digestSentinel = `agenthub-server@sha256:${zeroDigest}`;
const webDigestSentinel = `agenthub-app@sha256:${zeroDigest}`;
const immutableImage = /^.+@sha256:[0-9a-f]{64}$/;

const releaseTargets = {
  server: {
    defaultInput: path.join(repositoryRoot, 'packages/agenthub-server/deploy/base/agenthub.yaml'),
    deploymentName: 'agenthub-server',
    imageName: 'agenthub-server',
    label: 'AgentHub Server',
    sentinel: digestSentinel,
  },
  web: {
    defaultInput: path.join(repositoryRoot, 'packages/agenthub-app/deploy/agenthub-app.yaml'),
    deploymentName: 'agenthub-app',
    imageName: 'agenthub-app',
    label: 'AgentHub Web',
    sentinel: webDigestSentinel,
  },
};

function immutableReleaseImagePattern(imageName) {
  return new RegExp(`^[a-z0-9][a-z0-9.-]*(?::[0-9]+)?(?:/[a-z0-9._-]+)+/${imageName}@sha256:[0-9a-f]{64}$`);
}

function validateDeploymentSecurity(deployment, deploymentName) {
  const issues = [];
  if (deployment?.apiVersion !== 'apps/v1' || deployment?.kind !== 'Deployment'
      || deployment?.metadata?.name !== deploymentName) {
    return [`manifest must contain the apps/v1 ${deploymentName} Deployment`];
  }
  const podSpec = deployment.spec?.template?.spec;
  if (!podSpec) return [`${deploymentName} Deployment is missing spec.template.spec`];
  const groups = [
    ['container', podSpec.containers || []],
    ['initContainer', podSpec.initContainers || []],
    ['ephemeralContainer', podSpec.ephemeralContainers || []],
  ];
  for (const [kind, containers] of groups) {
    for (const container of containers) {
      if (!immutableImage.test(container?.image || '') || container.image.endsWith(`@sha256:${zeroDigest}`)) {
        issues.push(`${kind} ${container?.name || '<unnamed>'} must use a non-zero sha256 image digest`);
      }
      const security = container?.securityContext;
      if (security?.allowPrivilegeEscalation !== false) {
        issues.push(`${kind} ${container?.name || '<unnamed>'} must set allowPrivilegeEscalation=false`);
      }
      if (security?.privileged === true) issues.push(`${kind} ${container?.name || '<unnamed>'} must not be privileged`);
      if (!security?.capabilities?.drop?.includes('ALL')) {
        issues.push(`${kind} ${container?.name || '<unnamed>'} must drop ALL capabilities`);
      }
    }
  }
  if (!Array.isArray(podSpec.containers) || podSpec.containers.length === 0) {
    issues.push(`${deploymentName} Pod must contain at least one container`);
  }
  if (podSpec.automountServiceAccountToken !== false) {
    issues.push(`${deploymentName} Pod must set automountServiceAccountToken=false`);
  }
  if (podSpec.securityContext?.runAsNonRoot !== true) {
    issues.push(`${deploymentName} Pod must set runAsNonRoot=true`);
  }
  if (podSpec.securityContext?.seccompProfile?.type !== 'RuntimeDefault') {
    issues.push(`${deploymentName} Pod must use RuntimeDefault seccomp`);
  }
  return issues;
}

function validateAgentHubDeployment(deployment) {
  return validateDeploymentSecurity(deployment, 'agenthub-server');
}

function validateAgentHubWebDeployment(deployment) {
  const issues = validateDeploymentSecurity(deployment, 'agenthub-app');
  if (issues.length > 0 && !deployment?.spec?.template?.spec) return issues;
  const podSpec = deployment.spec.template.spec;
  const container = podSpec.containers?.find((candidate) => candidate.name === 'agenthub-app');
  if (!container) return [...issues, 'agenthub-app Pod must contain the agenthub-app container'];
  const httpPort = container.ports?.find((port) => port.name === 'http');
  if (httpPort?.containerPort !== 8080 || httpPort?.protocol !== 'TCP') {
    issues.push('agenthub-app container must expose named TCP port http on 8080');
  }
  for (const probe of ['livenessProbe', 'readinessProbe', 'startupProbe']) {
    if (container[probe]?.httpGet?.port !== 'http') issues.push(`agenthub-app ${probe} must use named port http`);
  }
  if (container.imagePullPolicy !== 'IfNotPresent') {
    issues.push('agenthub-app immutable image must use imagePullPolicy=IfNotPresent');
  }
  if (container.securityContext?.readOnlyRootFilesystem !== true) {
    issues.push('agenthub-app container must use a read-only root filesystem');
  }
  if (podSpec.securityContext?.runAsUser !== 101 || podSpec.securityContext?.runAsGroup !== 101) {
    issues.push('agenthub-app Pod must run as nginx UID/GID 101');
  }
  const mounts = new Set((container.volumeMounts || []).map((mount) => mount.mountPath));
  for (const mountPath of ['/var/cache/nginx', '/var/log/nginx', '/run']) {
    if (!mounts.has(mountPath)) issues.push(`agenthub-app read-only root requires a writable ${mountPath} volume`);
  }
  return issues;
}

function renderRelease(source, image, target, validator) {
  if (typeof image !== 'string' || !immutableReleaseImagePattern(target.imageName).test(image)
      || image.endsWith(`@sha256:${zeroDigest}`)) {
    throw new Error(`release requires an immutable ${target.label} image ending in a non-zero lowercase sha256 digest`);
  }
  const occurrences = source.split(target.sentinel).length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly one ${target.label} image digest sentinel, found ${occurrences}`);
  }
  const rendered = source.replace(target.sentinel, image);
  const documents = parseAllDocuments(rendered);
  const parseErrors = documents.flatMap((document) => document.errors || []);
  if (parseErrors.length > 0) throw new Error(`rendered Kubernetes YAML is invalid: ${parseErrors[0].message}`);
  const deployment = documents.map((document) => document.toJSON())
    .find((document) => document?.kind === 'Deployment' && document?.metadata?.name === target.deploymentName);
  const issues = validator(deployment);
  if (issues.length > 0) throw new Error(`rendered Kubernetes release failed policy: ${issues.join('; ')}`);
  return rendered;
}

function renderKubernetesRelease(source, image) {
  return renderRelease(source, image, releaseTargets.server, validateAgentHubDeployment);
}

function renderWebKubernetesRelease(source, image) {
  return renderRelease(source, image, releaseTargets.web, validateAgentHubWebDeployment);
}

function parseArguments(argv) {
  const result = { component: 'server', input: '', image: '', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--component' || argument === '--input' || argument === '--image' || argument === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!Object.hasOwn(releaseTargets, result.component)) {
    throw new Error('--component must be server or web');
  }
  if (!result.image) throw new Error('--image is required');
  if (!result.input) result.input = releaseTargets[result.component].defaultInput;
  return result;
}

function writeAtomic(output, contents) {
  const resolved = path.resolve(output);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx' });
    fs.chmodSync(temporary, 0o644);
    fs.renameSync(temporary, resolved);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const source = fs.readFileSync(path.resolve(options.input), 'utf8');
    const rendered = options.component === 'web'
      ? renderWebKubernetesRelease(source, options.image)
      : renderKubernetesRelease(source, options.image);
    if (options.output) writeAtomic(options.output, rendered);
    else process.stdout.write(rendered);
  } catch (error) {
    process.stderr.write(`Kubernetes release render failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  digestSentinel,
  renderKubernetesRelease,
  renderWebKubernetesRelease,
  validateAgentHubDeployment,
  validateAgentHubWebDeployment,
  webDigestSentinel,
};
