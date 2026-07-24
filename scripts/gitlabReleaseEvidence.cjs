#!/usr/bin/env node

const {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname, isAbsolute, relative, resolve, sep } = require('node:path');
const { randomUUID } = require('node:crypto');
const { parse } = require('yaml');

const RESERVED_PIPELINE_KEYS = new Set(['stages', 'include', 'default', 'workflow', 'variables', 'image', 'services', 'cache', 'before_script', 'after_script']);

function ruleTargetsRef(rule, ref) {
  const condition = typeof rule?.if === 'string' ? rule.if : '';
  return condition.includes('CI_COMMIT_BRANCH') && (
    condition.includes(`"${ref}"`) || condition.includes(`'${ref}'`)
  );
}

function ruleTargetsSchedule(rule) {
  const condition = typeof rule?.if === 'string' ? rule.if : '';
  return /\$CI_PIPELINE_SOURCE\s*==\s*["']schedule["']/.test(condition);
}

function parentNames(job) {
  if (!job?.extends) return [];
  return Array.isArray(job.extends) ? job.extends : [job.extends];
}

function inheritsFrom(job, target, pipeline, seen = new Set()) {
  for (const parentName of parentNames(job)) {
    if (parentName === target) return true;
    if (seen.has(parentName)) continue;
    seen.add(parentName);
    const parent = pipeline[parentName];
    if (parent && typeof parent === 'object' && inheritsFrom(parent, target, pipeline, seen)) return true;
  }
  return false;
}

function inheritedValue(job, key, pipeline, seen = new Set()) {
  if (Object.hasOwn(job, key)) return job[key];
  const parents = parentNames(job);
  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const parentName = parents[index];
    if (seen.has(parentName)) continue;
    seen.add(parentName);
    const parent = pipeline[parentName];
    if (!parent || typeof parent !== 'object') continue;
    const value = inheritedValue(parent, key, pipeline, seen);
    if (value !== undefined) return value;
  }
  return undefined;
}

function deriveScheduleVariables(pipeline) {
  const requirements = new Map();
  for (const [name, job] of Object.entries(pipeline)) {
    if (name.startsWith('.') || RESERVED_PIPELINE_KEYS.has(name) || !job || typeof job !== 'object') continue;
    const rules = inheritedValue(job, 'rules', pipeline);
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      const condition = typeof rule?.if === 'string' ? rule.if : '';
      if (!condition.includes('CI_PIPELINE_SOURCE') || !condition.includes('schedule')) continue;
      const comparisons = condition.matchAll(/\$([A-Z][A-Z0-9_]*)\s*==\s*["']([^"']+)["']/g);
      for (const [, variable, value] of comparisons) {
        if (variable === 'CI_PIPELINE_SOURCE') continue;
        const previous = requirements.get(variable);
        if (previous !== undefined && previous !== value) {
          throw new Error(`Conflicting scheduled GitLab values for ${variable}`);
        }
        requirements.set(variable, value);
      }
    }
  }
  return Object.fromEntries([...requirements.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function deriveReleaseEvidencePolicy(source, ref = 'master') {
  const pipeline = parse(source);
  if (!pipeline || typeof pipeline !== 'object') throw new Error('GitLab pipeline must be a YAML object');
  const requiredJobs = [];
  const artifactJobs = [];
  const scheduleJobs = [];
  const scheduleArtifactJobs = [];
  for (const [name, job] of Object.entries(pipeline)) {
    if (name.startsWith('.') || RESERVED_PIPELINE_KEYS.has(name) || !job || typeof job !== 'object') continue;
    const rules = inheritedValue(job, 'rules', pipeline);
    const matchingRule = Array.isArray(rules) ? rules.find((rule) => ruleTargetsRef(rule, ref)) : undefined;
    const scheduleRule = Array.isArray(rules) ? rules.find((rule) => ruleTargetsSchedule(rule)) : undefined;
    const manual = matchingRule?.when === 'manual';
    const allowFailure = inheritedValue(job, 'allow_failure', pipeline);
    const artifacts = inheritedValue(job, 'artifacts', pipeline);
    if (scheduleRule && !['manual', 'never'].includes(scheduleRule.when) && allowFailure === false) {
      scheduleJobs.push(name);
      if (artifacts && typeof artifacts === 'object') scheduleArtifactJobs.push(name);
    }
    const required = !manual && (
      inheritsFrom(job, '.required', pipeline)
      || (allowFailure === false && matchingRule !== undefined)
    );
    if (!required) continue;
    requiredJobs.push(name);
    if (artifacts && typeof artifacts === 'object') artifactJobs.push(name);
  }
  if (requiredJobs.length === 0) throw new Error(`No required GitLab jobs target ${ref}`);
  return {
    ref,
    requiredJobs: requiredJobs.sort(),
    artifactJobs: artifactJobs.sort(),
    scheduleVariables: deriveScheduleVariables(pipeline),
    scheduleJobs: scheduleJobs.sort(),
    scheduleArtifactJobs: scheduleArtifactJobs.sort(),
  };
}

function assertHttpsOrLoopback(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CI_API_V4_URL must be a valid absolute URL');
  }
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('CI_API_V4_URL must use HTTPS or loopback HTTP');
  }
  if (url.username || url.password) throw new Error('CI_API_V4_URL must not contain credentials');
  if (url.search || url.hash) throw new Error('CI_API_V4_URL must not contain a query or fragment');
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error('CI_API_V4_URL contains invalid path encoding');
  }
  const segments = decodedPath.split('/');
  if (segments.includes('.') || segments.includes('..')) {
    throw new Error('CI_API_V4_URL must not contain path traversal');
  }
  const normalizedPath = url.pathname.replace(/\/+$/, '');
  if (!normalizedPath.endsWith('/api/v4')) throw new Error('CI_API_V4_URL must end with /api/v4');
  url.pathname = normalizedPath;
  return url.toString();
}

function assertProjectPath(value) {
  if (value.length > 512) throw new Error('CI_PROJECT_PATH is too long');
  const segments = value.split('/');
  if (segments.length < 2 || segments.some((segment) => (
    !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9_.-]+$/.test(segment)
  ))) {
    throw new Error('CI_PROJECT_PATH must be a canonical namespace/project path');
  }
  return value;
}

function assertSameGitLabOrigin(apiBaseUrl, serverUrl) {
  if (!serverUrl) return;
  let server;
  try {
    server = new URL(serverUrl);
  } catch {
    throw new Error('CI_SERVER_URL must be a valid absolute URL');
  }
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(server.hostname);
  if (server.protocol !== 'https:' && !(server.protocol === 'http:' && loopback)) {
    throw new Error('CI_SERVER_URL must use HTTPS or loopback HTTP');
  }
  if (server.username || server.password || server.search || server.hash) {
    throw new Error('CI_SERVER_URL must not contain credentials, a query, or a fragment');
  }
  if (new URL(apiBaseUrl).origin !== server.origin) {
    throw new Error('CI_API_V4_URL must use the same origin as CI_SERVER_URL');
  }
}

function resolveEvidenceOutputPath(env) {
  const projectDir = resolve(env.CI_PROJECT_DIR || process.cwd());
  const configured = env.GITLAB_EVIDENCE_OUTPUT || 'reports/gitlab/release-evidence.json';
  const outputPath = resolve(projectDir, configured);
  const projectRelative = relative(projectDir, outputPath);
  if (!projectRelative || projectRelative === '..' || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative)) {
    throw new Error('GITLAB_EVIDENCE_OUTPUT must stay within CI_PROJECT_DIR');
  }
  return outputPath;
}

function boundedIntegerFromEnv(env, name, fallback, minimum, maximum) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function resolveGitLabEvidenceConfig(env = process.env) {
  const apiBaseUrl = env.CI_API_V4_URL || env.GITLAB_API_V4_URL;
  if (!apiBaseUrl) throw new Error('CI_API_V4_URL is required');
  if (!env.CI_PROJECT_PATH) throw new Error('CI_PROJECT_PATH is required');
  if (!/^[a-f0-9]{40}$/i.test(env.CI_COMMIT_SHA || '')) throw new Error('CI_COMMIT_SHA must be a 40-character commit SHA');
  const privateToken = env.GITLAB_TOKEN;
  const jobToken = env.CI_JOB_TOKEN;
  if (Boolean(privateToken) === Boolean(jobToken)) {
    throw new Error('Exactly one of GITLAB_TOKEN or CI_JOB_TOKEN is required');
  }
  const normalizedApiBaseUrl = assertHttpsOrLoopback(apiBaseUrl);
  assertSameGitLabOrigin(normalizedApiBaseUrl, env.CI_SERVER_URL);
  return {
    apiBaseUrl: normalizedApiBaseUrl,
    projectPath: assertProjectPath(env.CI_PROJECT_PATH),
    expectedSha: env.CI_COMMIT_SHA.toLowerCase(),
    token: privateToken || jobToken,
    tokenHeader: privateToken ? 'PRIVATE-TOKEN' : 'JOB-TOKEN',
    outputPath: resolveEvidenceOutputPath(env),
    requestTimeoutMs: boundedIntegerFromEnv(env, 'GITLAB_EVIDENCE_TIMEOUT_MS', 15_000, 1, 120_000),
    maxAttempts: boundedIntegerFromEnv(env, 'GITLAB_EVIDENCE_MAX_ATTEMPTS', 3, 1, 5),
    retryDelayMs: boundedIntegerFromEnv(env, 'GITLAB_EVIDENCE_RETRY_DELAY_MS', 250, 0, 5_000),
    maxResponseBytes: boundedIntegerFromEnv(env, 'GITLAB_EVIDENCE_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, 1, 10 * 1024 * 1024),
    scheduleMaxAgeHours: boundedIntegerFromEnv(env, 'GITLAB_EVIDENCE_SCHEDULE_MAX_AGE_HOURS', 48, 1, 720),
  };
}

function safeJob(job) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    allowFailure: job.allow_failure === true,
    artifactsExpireAt: job.artifacts_expire_at || null,
    artifacts: Array.isArray(job.artifacts)
      ? job.artifacts.map((artifact) => ({ fileType: artifact.file_type, filename: artifact.filename, size: artifact.size }))
      : [],
  };
}

function assertPositiveIntegerId(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} id must be a positive integer`);
  return value;
}

async function collectGitLabReleaseEvidence(options) {
  const {
    apiBaseUrl,
    projectPath,
    expectedSha,
    token,
    tokenHeader,
    policy,
    fetchImpl = fetch,
    requestTimeoutMs = 15_000,
    maxAttempts = 3,
    retryDelayMs = 250,
    maxResponseBytes = 2 * 1024 * 1024,
    sleepImpl = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
    now = () => new Date(),
    scheduleMaxAgeHours = 48,
  } = options;
  if (!token || !['PRIVATE-TOKEN', 'JOB-TOKEN'].includes(tokenHeader)) throw new Error('A supported GitLab API credential is required');
  if (!/^[a-f0-9]{40}$/i.test(expectedSha || '')) throw new Error('Expected SHA must be a 40-character commit SHA');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 120_000) throw new Error('GitLab request timeout must be an integer from 1 to 120000ms');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error('GitLab max attempts must be an integer from 1 to 5');
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 5_000) throw new Error('GitLab retry delay must be an integer from 0 to 5000ms');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 10 * 1024 * 1024) throw new Error('GitLab response limit must be an integer from 1 to 10485760 bytes');
  if (!Number.isInteger(scheduleMaxAgeHours) || scheduleMaxAgeHours < 1 || scheduleMaxAgeHours > 720) throw new Error('GitLab schedule max age must be an integer from 1 to 720 hours');
  const capturedAt = now();
  if (!(capturedAt instanceof Date) || !Number.isFinite(capturedAt.getTime())) throw new Error('GitLab evidence capture time must be a valid Date');
  const base = assertHttpsOrLoopback(apiBaseUrl);
  const headers = { [tokenHeader]: token };
  async function readBoundedResponseText(response, path) {
    if (!response.body?.getReader) {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
        throw new Error(`GitLab API ${path} response exceeds ${maxResponseBytes} bytes`);
      }
      return text;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        totalBytes += chunk.byteLength;
        if (totalBytes > maxResponseBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`GitLab API ${path} response exceeds ${maxResponseBytes} bytes`);
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, totalBytes).toString('utf8');
  }

  async function apiPage(path) {
    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        response = await fetchImpl(`${base}${path}`, { headers, signal: controller.signal, redirect: 'error' });
      } catch (error) {
        const failure = controller.signal.aborted
          ? new Error(`GitLab API ${path} timed out after ${requestTimeoutMs}ms`)
          : new Error(`GitLab API ${path} request failed: ${error.message}`);
        if (attempt === maxAttempts) throw failure;
        await sleepImpl(retryDelayMs);
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (![429, 502, 503, 504].includes(response.status) || attempt === maxAttempts) break;
      await response.body?.cancel?.().catch(() => {});
      await sleepImpl(retryDelayMs);
    }

    const contentLength = response.headers?.get?.('content-length');
    if (contentLength !== null && contentLength !== undefined && contentLength !== '') {
      if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
        throw new Error(`GitLab API ${path} returned an invalid content length`);
      }
      if (Number(contentLength) > maxResponseBytes) {
        throw new Error(`GitLab API ${path} response exceeds ${maxResponseBytes} bytes`);
      }
    }
    const text = await readBoundedResponseText(response, path);
    if (!response.ok) throw new Error(`GitLab API ${path} failed with HTTP ${response.status}`);
    try {
      return {
        body: text ? JSON.parse(text) : null,
        nextPage: response.headers?.get?.('x-next-page') || '',
      };
    } catch {
      throw new Error(`GitLab API ${path} returned invalid JSON`);
    }
  }

  async function api(path) {
    return (await apiPage(path)).body;
  }

  async function apiAll(path) {
    const items = [];
    let pagePath = path;
    let currentPage = 1;
    for (let requestCount = 0; requestCount < 100; requestCount += 1) {
      const { body, nextPage } = await apiPage(pagePath);
      if (!Array.isArray(body)) throw new Error(`GitLab API ${pagePath} must return an array`);
      items.push(...body);
      if (!nextPage) return items;
      if (!/^\d+$/.test(nextPage)) throw new Error(`GitLab API ${pagePath} returned an invalid next page`);
      const parsedPage = Number(nextPage);
      if (!Number.isSafeInteger(parsedPage) || parsedPage <= currentPage) {
        throw new Error(`GitLab API ${pagePath} returned a non-increasing next page`);
      }
      currentPage = parsedPage;
      pagePath = `${path}${path.includes('?') ? '&' : '?'}page=${parsedPage}`;
    }
    throw new Error(`GitLab API ${path} exceeded 100 pages`);
  }

  function validateJobs(allJobs, requiredNames, artifactNames, jobKind) {
    const latestJobs = new Map();
    for (const job of [...allJobs].sort((a, b) => b.id - a.id)) {
      if (!latestJobs.has(job.name)) latestJobs.set(job.name, job);
    }
    return requiredNames.map((name) => {
      const job = latestJobs.get(name);
      const artifactOwner = jobKind === 'required' ? name : `${jobKind} job ${name}`;
      if (!job || job.status !== 'success' || job.allow_failure === true) {
        throw new Error(`GitLab ${jobKind} job ${name} must exist, succeed, and disallow failure`);
      }
      assertPositiveIntegerId(job.id, `GitLab ${jobKind} job ${name}`);
      if (artifactNames.includes(name)) {
        const retained = Array.isArray(job.artifacts) && job.artifacts.some((artifact) => Number(artifact.size) > 0);
        if (!retained) throw new Error(`GitLab retained artifact for ${artifactOwner} is missing or empty`);
        if (!Object.hasOwn(job, 'artifacts_expire_at')) throw new Error(`GitLab retained artifact for ${artifactOwner} has no expiry metadata`);
        if (job.artifacts_expire_at !== null) {
          const expiresAt = Date.parse(job.artifacts_expire_at);
          if (!Number.isFinite(expiresAt)) throw new Error(`GitLab retained artifact for ${artifactOwner} has invalid expiry metadata`);
          if (expiresAt <= capturedAt.getTime()) throw new Error(`GitLab retained artifact for ${artifactOwner} is expired`);
        }
      }
      return safeJob(job);
    });
  }

  const project = await api(`/projects/${encodeURIComponent(projectPath)}`);
  if (project.path_with_namespace !== projectPath) throw new Error('GitLab project path does not match the requested release target');
  if (project.default_branch !== policy.ref) throw new Error(`GitLab default branch must be ${policy.ref}`);
  if (project.only_allow_merge_if_pipeline_succeeds !== true) {
    throw new Error('GitLab project must require a successful pipeline before merge');
  }
  const projectId = assertPositiveIntegerId(project.id, 'GitLab project');
  const protectedBranch = await api(`/projects/${projectId}/protected_branches/${encodeURIComponent(policy.ref)}`);
  if (protectedBranch.name !== policy.ref || protectedBranch.allow_force_push !== false) {
    throw new Error(`${policy.ref} must be protected with force push disabled`);
  }
  if (!Array.isArray(protectedBranch.push_access_levels) || protectedBranch.push_access_levels.length === 0) {
    throw new Error(`${policy.ref} protected branch push access must disable direct pushes`);
  }
  for (const level of protectedBranch.push_access_levels) {
    const actorSpecific = ['user_id', 'group_id', 'deploy_key_id'].some((key) => level[key] !== null && level[key] !== undefined);
    if (level.access_level !== 0 || actorSpecific) {
      throw new Error(`${policy.ref} protected branch push access must be No one without actor-specific exceptions`);
    }
  }
  const schedules = await apiAll(`/projects/${projectId}/pipeline_schedules?per_page=100`);
  const schedule = schedules.find((candidate) => candidate.active === true && (
    candidate.ref === policy.ref || candidate.ref === `refs/heads/${policy.ref}`
  ));
  if (!schedule) throw new Error(`An active ${policy.ref} pipeline schedule is required`);
  assertPositiveIntegerId(schedule.id, 'GitLab pipeline schedule');
  const scheduleDetail = await api(`/projects/${projectId}/pipeline_schedules/${schedule.id}`);
  if (scheduleDetail.id !== schedule.id || scheduleDetail.active !== true || ![policy.ref, `refs/heads/${policy.ref}`].includes(scheduleDetail.ref)) {
    throw new Error(`Selected GitLab pipeline schedule no longer matches active ${policy.ref}`);
  }
  const scheduledVariables = new Map();
  if (!Array.isArray(scheduleDetail.variables)) throw new Error('GitLab pipeline schedule variables must be an array');
  for (const variable of scheduleDetail.variables) {
    if (typeof variable?.key !== 'string' || typeof variable?.value !== 'string') throw new Error('GitLab pipeline schedule contains malformed variable metadata');
    if (scheduledVariables.has(variable.key)) throw new Error(`GitLab pipeline schedule variable ${variable.key} is duplicated`);
    scheduledVariables.set(variable.key, variable);
  }
  const requiredScheduleVariables = Object.entries(policy.scheduleVariables || {});
  for (const [name, expectedValue] of requiredScheduleVariables) {
    const variable = scheduledVariables.get(name);
    if (!variable || variable.value !== expectedValue || variable.variable_type !== 'env_var') {
      throw new Error(`GitLab pipeline schedule variable ${name} must equal ${expectedValue} as env_var`);
    }
  }
  const lastScheduledPipeline = scheduleDetail.last_pipeline;
  if (!lastScheduledPipeline || lastScheduledPipeline.status !== 'success') {
    throw new Error('GitLab latest scheduled pipeline must be successful');
  }
  assertPositiveIntegerId(lastScheduledPipeline.id, 'GitLab scheduled pipeline');
  if (!/^[a-f0-9]{40}$/i.test(lastScheduledPipeline.sha || '') || lastScheduledPipeline.ref !== policy.ref || lastScheduledPipeline.source !== 'schedule') {
    throw new Error(`GitLab latest scheduled pipeline must target ${policy.ref} from schedule`);
  }
  const [scheduledPipelineDetail, scheduledAllJobs] = await Promise.all([
    api(`/projects/${projectId}/pipelines/${lastScheduledPipeline.id}`),
    apiAll(`/projects/${projectId}/pipelines/${lastScheduledPipeline.id}/jobs?per_page=100&include_retried=true`),
  ]);
  if (scheduledPipelineDetail.id !== lastScheduledPipeline.id
    || scheduledPipelineDetail.sha?.toLowerCase() !== lastScheduledPipeline.sha.toLowerCase()
    || scheduledPipelineDetail.ref !== policy.ref
    || scheduledPipelineDetail.status !== 'success'
    || scheduledPipelineDetail.source !== 'schedule') {
    throw new Error('Selected GitLab scheduled pipeline no longer matches the successful schedule target');
  }
  const scheduledUpdatedAt = Date.parse(scheduledPipelineDetail.updated_at);
  if (!Number.isFinite(scheduledUpdatedAt)) throw new Error('GitLab latest scheduled pipeline has invalid updated_at');
  if (scheduledUpdatedAt > capturedAt.getTime() + 5 * 60 * 1000) throw new Error('GitLab latest scheduled pipeline updated_at is in the future');
  if (capturedAt.getTime() - scheduledUpdatedAt > scheduleMaxAgeHours * 60 * 60 * 1000) {
    throw new Error(`GitLab latest scheduled pipeline is older than ${scheduleMaxAgeHours} hours`);
  }
  const scheduledRequiredJobs = validateJobs(
    scheduledAllJobs,
    policy.scheduleJobs || [],
    policy.scheduleArtifactJobs || [],
    'scheduled',
  );

  const sha = expectedSha.toLowerCase();
  const pipelines = await apiAll(`/projects/${projectId}/pipelines?ref=${encodeURIComponent(policy.ref)}&sha=${sha}&per_page=20`);
  const exactPipelines = pipelines.filter((candidate) => candidate.sha?.toLowerCase() === sha && candidate.ref === policy.ref);
  for (const candidate of exactPipelines) assertPositiveIntegerId(candidate.id, 'GitLab pipeline');
  exactPipelines.sort((left, right) => right.id - left.id);
  const pipeline = exactPipelines[0];
  if (!pipeline) throw new Error(`No pipeline for exact SHA ${sha}`);
  if (pipeline.status !== 'success') throw new Error(`Latest exact-SHA pipeline must be successful for ${sha}`);
  const [detail, allJobs] = await Promise.all([
    api(`/projects/${projectId}/pipelines/${pipeline.id}`),
    apiAll(`/projects/${projectId}/pipelines/${pipeline.id}/jobs?per_page=100&include_retried=true`),
  ]);
  if (detail.id !== pipeline.id || detail.status !== 'success' || detail.sha?.toLowerCase() !== sha || detail.ref !== policy.ref) {
    throw new Error('Selected GitLab pipeline no longer matches the successful release target');
  }
  if (detail.source !== 'push') throw new Error('Selected GitLab pipeline source must be push');
  const requiredJobs = validateJobs(allJobs, policy.requiredJobs, policy.artifactJobs, 'required');

  return {
    schemaVersion: 1,
    status: 'passed',
    capturedAt: capturedAt.toISOString(),
    project: {
      id: project.id,
      path: project.path_with_namespace,
      visibility: project.visibility,
      defaultBranch: project.default_branch,
      pipelineMustSucceed: project.only_allow_merge_if_pipeline_succeeds,
    },
    protectedBranch: {
      name: protectedBranch.name,
      allowForcePush: protectedBranch.allow_force_push,
      codeOwnerApprovalRequired: protectedBranch.code_owner_approval_required === true,
      pushAccessLevels: (protectedBranch.push_access_levels || []).map((level) => level.access_level_description),
      mergeAccessLevels: (protectedBranch.merge_access_levels || []).map((level) => level.access_level_description),
    },
    schedule: {
      id: scheduleDetail.id,
      description: scheduleDetail.description,
      ref: scheduleDetail.ref,
      active: scheduleDetail.active,
      cron: scheduleDetail.cron,
      nextRunAt: scheduleDetail.next_run_at,
      requiredVariables: requiredScheduleVariables.map(([name]) => name),
      pipeline: {
        id: scheduledPipelineDetail.id,
        sha: scheduledPipelineDetail.sha,
        ref: scheduledPipelineDetail.ref,
        status: scheduledPipelineDetail.status,
        source: scheduledPipelineDetail.source,
        createdAt: scheduledPipelineDetail.created_at,
        updatedAt: scheduledPipelineDetail.updated_at,
        webUrl: scheduledPipelineDetail.web_url,
      },
      requiredJobs: scheduledRequiredJobs,
    },
    pipeline: {
      id: detail.id,
      sha: detail.sha,
      ref: detail.ref,
      status: detail.status,
      source: detail.source,
      createdAt: detail.created_at,
      updatedAt: detail.updated_at,
      webUrl: detail.web_url,
    },
    requiredJobs,
    requiredJobCount: requiredJobs.length,
    artifactJobCount: policy.artifactJobs.length,
  };
}

function writePrivateJsonAtomic(outputPath, value) {
  const absolute = resolve(outputPath);
  const parent = dirname(absolute);
  assertNoSymbolicLinks(parent);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertNoSymbolicLinks(parent);
  assertNoSymbolicLinks(absolute);
  chmodSync(parent, 0o700);
  const temporary = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, absolute);
    chmodSync(absolute, 0o600);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

function assertNoSymbolicLinks(targetPath) {
  let current = resolve(targetPath);
  while (true) {
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`Evidence output path must not contain a symbolic link: ${current}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const next = dirname(current);
    if (next === current) return;
    current = next;
  }
}

async function main() {
  const config = resolveGitLabEvidenceConfig();
  const pipelineSource = readFileSync(resolve('.gitlab-ci.yml'), 'utf8');
  const policy = deriveReleaseEvidencePolicy(pipelineSource, 'master');
  const evidence = await collectGitLabReleaseEvidence({ ...config, policy });
  writePrivateJsonAtomic(config.outputPath, evidence);
  process.stdout.write(`GitLab release evidence PASS: pipeline ${evidence.pipeline.id}, ${evidence.requiredJobCount} required jobs, ${evidence.artifactJobCount} artifact jobs\n`);
}

module.exports = {
  collectGitLabReleaseEvidence,
  deriveReleaseEvidencePolicy,
  resolveGitLabEvidenceConfig,
  writePrivateJsonAtomic,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`GitLab release evidence FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
