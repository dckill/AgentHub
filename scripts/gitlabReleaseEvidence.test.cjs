const assert = require('node:assert/strict');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const rootPackage = require('../package.json');

const {
  collectGitLabReleaseEvidence,
  deriveReleaseEvidencePolicy,
  resolveGitLabEvidenceConfig,
  writePrivateJsonAtomic,
} = require('./gitlabReleaseEvidence.cjs');

const pipelineYaml = `
.required:
  rules:
    - if: '$CI_COMMIT_BRANCH == "master"'
.container:
  rules:
    - if: '$CI_COMMIT_BRANCH == "master" && $CI_COMMIT_REF_PROTECTED == "true"'
  allow_failure: false
.deploy:
  rules:
    - if: '$CI_COMMIT_BRANCH == "master" && $CI_COMMIT_REF_PROTECTED == "true"'
      when: manual
    - when: never
  allow_failure: false
validate:
  extends: .required
  script: pnpm check
  allow_failure: false
web:contract:
  extends: .required
  script: pnpm web:contract:test
  allow_failure: false
  artifacts:
    reports:
      junit: reports/web-contract/junit.xml
app:test:
  extends: .required
  script: pnpm --filter agenthub-app test:ci
  allow_failure: false
  artifacts:
    paths:
      - packages/agenthub-app/coverage/
secret_detection:
  rules:
    - if: '$CI_COMMIT_BRANCH == "master"'
  allow_failure: false
container:server:
  extends: .container
  artifacts:
    paths: [reports/server.env]
deploy:production:
  extends: .deploy
provider:matrix:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule" && $AGENTHUB_PROVIDER_MATRIX == "true"'
    - when: never
  allow_failure: false
  artifacts:
    paths: [reports/provider.log]
`;

const policy = {
  ref: 'master',
  requiredJobs: ['app:test', 'container:server', 'secret_detection', 'validate', 'web:contract'],
  artifactJobs: ['app:test', 'container:server', 'web:contract'],
  scheduleVariables: { AGENTHUB_PROVIDER_MATRIX: 'true' },
  scheduleJobs: ['provider:matrix'],
  scheduleArtifactJobs: ['provider:matrix'],
};

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function createApiFixture(overrides = {}) {
  const sha = 'a'.repeat(40);
  const recentScheduledAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const jobs = policy.requiredJobs.map((name, index) => ({
    id: 100 + index,
    name,
    status: 'success',
    allow_failure: false,
    artifacts_expire_at: policy.artifactJobs.includes(name) ? '2099-08-17T00:00:00Z' : null,
    artifacts: policy.artifactJobs.includes(name)
      ? [{ file_type: name === 'web:contract' ? 'junit' : 'archive', size: 123 }]
      : [],
    ...overrides.jobs?.[name],
  }));
  const routes = new Map([
    ['/projects/AI%2FHappy-AgentRemote', { id: 42, path_with_namespace: 'AI/Happy-AgentRemote', default_branch: 'master', visibility: 'private', only_allow_merge_if_pipeline_succeeds: true }],
    ['/projects/42/protected_branches/master', { name: 'master', allow_force_push: false, push_access_levels: [{ access_level: 0, access_level_description: 'No one' }], merge_access_levels: [{ access_level: 30, access_level_description: 'Developers + Maintainers' }] }],
    ['/projects/42/pipeline_schedules?per_page=100', [{ id: 7, description: 'AgentHub nightly', ref: 'master', active: true, cron: '0 2 * * *', next_run_at: '2026-07-18T02:00:00Z' }]],
    ['/projects/42/pipeline_schedules/7', { id: 7, description: 'AgentHub nightly', ref: 'master', active: true, cron: '0 2 * * *', variables: [{ key: 'AGENTHUB_PROVIDER_MATRIX', value: 'true', variable_type: 'env_var' }], last_pipeline: { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule' } }],
    ['/projects/42/pipelines/70', { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule', created_at: recentScheduledAt, updated_at: recentScheduledAt, web_url: 'https://gitlab.invalid/pipelines/70' }],
    ['/projects/42/pipelines/70/jobs?per_page=100&include_retried=true', [{ id: 700, name: 'provider:matrix', status: 'success', allow_failure: false, artifacts_expire_at: '2099-08-17T00:00:00Z', artifacts: [{ file_type: 'archive', size: 123 }] }]],
    [`/projects/42/pipelines?ref=master&sha=${sha}&per_page=20`, [{ id: 99, sha, ref: 'master', status: 'success', source: 'push', web_url: 'https://gitlab.invalid/pipelines/99' }]],
    ['/projects/42/pipelines/99', { id: 99, sha, ref: 'master', status: 'success', source: 'push', web_url: 'https://gitlab.invalid/pipelines/99', created_at: '2026-07-17T01:00:00Z', updated_at: '2026-07-17T01:10:00Z' }],
    ['/projects/42/pipelines/99/jobs?per_page=100&include_retried=true', jobs],
  ]);
  for (const [route, body] of Object.entries(overrides.routes ?? {})) routes.set(route, body);
  const seenHeaders = [];
  const seenOptions = [];
  const fetchImpl = async (url, options) => {
    seenHeaders.push(options.headers);
    seenOptions.push(options);
    const route = new URL(url).pathname.replace('/api/v4', '') + new URL(url).search;
    return routes.has(route)
      ? jsonResponse(routes.get(route), 200, overrides.headers?.[route])
      : jsonResponse({ message: `missing ${route}` }, 404);
  };
  return { fetchImpl, seenHeaders, seenOptions, sha, jobs };
}

test('derives required and retained-artifact jobs from the GitLab source of truth', () => {
  assert.deepEqual(deriveReleaseEvidencePolicy(pipelineYaml, 'master'), policy);
});

test('derives every protected schedule-only integration switch from the real pipeline', () => {
  const source = readFileSync(join(__dirname, '..', '.gitlab-ci.yml'), 'utf8');
  assert.deepEqual(deriveReleaseEvidencePolicy(source, 'master').scheduleVariables, {
    AGENTHUB_PLATFORM_INTEGRATION: 'true',
    AGENTHUB_PROVIDER_MATRIX: 'true',
  });
  assert.deepEqual(deriveReleaseEvidencePolicy(source, 'master').scheduleJobs, [
    'app:nightly',
    'cli:platform-matrix:macos',
    'cli:platform-matrix:windows',
    'cli:provider-matrix',
    'secret_detection',
  ]);
  assert.deepEqual(deriveReleaseEvidencePolicy(source, 'master').scheduleArtifactJobs, [
    'app:nightly',
    'cli:platform-matrix:macos',
    'cli:platform-matrix:windows',
    'cli:provider-matrix',
  ]);
});

test('collects an exact successful protected-master pipeline without returning credentials', async () => {
  const fixture = createApiFixture();
  const result = await collectGitLabReleaseEvidence({
    apiBaseUrl: 'https://gitlab.invalid/api/v4',
    projectPath: 'AI/Happy-AgentRemote',
    expectedSha: fixture.sha,
    token: 'never-serialize-this-token',
    tokenHeader: 'PRIVATE-TOKEN',
    policy,
    fetchImpl: fixture.fetchImpl,
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.pipeline.sha, fixture.sha);
  assert.deepEqual(result.requiredJobs.map((job) => job.name), policy.requiredJobs);
  assert.equal(result.schedule.active, true);
  assert.deepEqual(result.schedule.requiredVariables, ['AGENTHUB_PROVIDER_MATRIX']);
  assert.deepEqual(result.schedule.requiredJobs.map((job) => job.name), ['provider:matrix']);
  assert.equal(result.protectedBranch.allowForcePush, false);
  assert.equal(result.project.pipelineMustSucceed, true);
  assert.doesNotMatch(JSON.stringify(result), /never-serialize-this-token/);
  assert.ok(fixture.seenHeaders.every((headers) => headers['PRIVATE-TOKEN'] === 'never-serialize-this-token'));
  assert.ok(fixture.seenOptions.every((options) => options.redirect === 'error'));
});

test('rejects a protected branch that can bypass required pipeline success', async (t) => {
  const unsafeTargets = [
    ['merge without pipeline success', {
      '/projects/AI%2FHappy-AgentRemote': { id: 42, path_with_namespace: 'AI/Happy-AgentRemote', default_branch: 'master', visibility: 'private', only_allow_merge_if_pipeline_succeeds: false },
    }, /successful pipeline before merge/],
    ['developer direct push', {
      '/projects/42/protected_branches/master': { name: 'master', allow_force_push: false, push_access_levels: [{ access_level: 30, access_level_description: 'Developers + Maintainers' }], merge_access_levels: [{ access_level: 30, access_level_description: 'Developers + Maintainers' }] },
    }, /push access/],
    ['actor-specific push exception', {
      '/projects/42/protected_branches/master': { name: 'master', allow_force_push: false, push_access_levels: [{ access_level: 40, access_level_description: 'Maintainer bot', user_id: 7 }], merge_access_levels: [{ access_level: 30, access_level_description: 'Developers + Maintainers' }] },
    }, /push access/],
  ];
  for (const [name, routes, pattern] of unsafeTargets) {
    await t.test(name, async () => {
      const fixture = createApiFixture({ routes });
      await assert.rejects(() => collectGitLabReleaseEvidence({
        apiBaseUrl: 'https://gitlab.invalid/api/v4',
        projectPath: 'AI/Happy-AgentRemote',
        expectedSha: fixture.sha,
        token: 'secret',
        tokenHeader: 'PRIVATE-TOKEN',
        policy,
        fetchImpl: fixture.fetchImpl,
      }), pattern);
    });
  }
});

test('follows GitLab pagination for schedules, exact-SHA pipelines, and retried jobs', async () => {
  const sha = 'a'.repeat(40);
  const scheduleRoute = '/projects/42/pipeline_schedules?per_page=100';
  const pipelineRoute = `/projects/42/pipelines?ref=master&sha=${sha}&per_page=20`;
  const jobsRoute = '/projects/42/pipelines/99/jobs?per_page=100&include_retried=true';
  const fixture = createApiFixture({
    routes: {
      [scheduleRoute]: [],
      [`${scheduleRoute}&page=2`]: [{ id: 7, description: 'AgentHub nightly', ref: 'master', active: true, cron: '0 2 * * *' }],
      [pipelineRoute]: [],
      [`${pipelineRoute}&page=2`]: [{ id: 99, sha, ref: 'master', status: 'success' }],
      [jobsRoute]: [{ id: 1, name: 'validate', status: 'failed', allow_failure: false, artifacts: [] }],
      [`${jobsRoute}&page=2`]: policy.requiredJobs.map((name, index) => ({
        id: 200 + index,
        name,
        status: 'success',
        allow_failure: false,
        artifacts_expire_at: policy.artifactJobs.includes(name) ? null : undefined,
        artifacts: policy.artifactJobs.includes(name) ? [{ file_type: 'archive', size: 123 }] : [],
      })),
    },
    headers: {
      [scheduleRoute]: { 'x-next-page': '2' },
      [pipelineRoute]: { 'x-next-page': '2' },
      [jobsRoute]: { 'x-next-page': '2' },
    },
  });

  const result = await collectGitLabReleaseEvidence({
    apiBaseUrl: 'https://gitlab.invalid/api/v4',
    projectPath: 'AI/Happy-AgentRemote',
    expectedSha: fixture.sha,
    token: 'secret',
    tokenHeader: 'PRIVATE-TOKEN',
    policy,
    fetchImpl: fixture.fetchImpl,
  });

  assert.equal(result.requiredJobCount, policy.requiredJobs.length);
  assert.equal(result.requiredJobs.find((job) => job.name === 'validate').id, 203);
});

test('rejects malformed or non-increasing GitLab pagination', async (t) => {
  const route = '/projects/42/pipeline_schedules?per_page=100';
  for (const [name, nextPage, pattern] of [
    ['malformed', 'next', /invalid next page/],
    ['non-increasing', '1', /non-increasing next page/],
  ]) {
    await t.test(name, async () => {
      const fixture = createApiFixture({
        routes: { [route]: [] },
        headers: { [route]: { 'x-next-page': nextPage } },
      });
      await assert.rejects(() => collectGitLabReleaseEvidence({
        apiBaseUrl: 'https://gitlab.invalid/api/v4',
        projectPath: 'AI/Happy-AgentRemote',
        expectedSha: fixture.sha,
        token: 'secret',
        tokenHeader: 'PRIVATE-TOKEN',
        policy,
        fetchImpl: fixture.fetchImpl,
      }), pattern);
    });
  }
});

test('bounds GitLab API latency, transient retries, and response size', async (t) => {
  await t.test('timeout', async () => {
    const fetchImpl = async (_url, options) => {
      assert.ok(options.signal, 'collector must pass an AbortSignal');
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    };
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: 'a'.repeat(40),
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl,
      requestTimeoutMs: 5,
      maxAttempts: 1,
      retryDelayMs: 0,
    }), /timed out after 5ms/);
  });

  await t.test('transient retry', async () => {
    const fixture = createApiFixture();
    let attempts = 0;
    const fetchImpl = async (url, options) => {
      attempts += 1;
      if (attempts === 1) return jsonResponse({ message: 'temporarily unavailable' }, 503);
      return fixture.fetchImpl(url, options);
    };
    const result = await collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: fixture.sha,
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl,
      requestTimeoutMs: 100,
      retryDelayMs: 0,
      maxAttempts: 2,
    });
    assert.equal(result.status, 'passed');
    assert.equal(attempts, 10);
  });

  await t.test('response size', async () => {
    const route = '/projects/AI%2FHappy-AgentRemote';
    const fixture = createApiFixture({
      headers: { [route]: { 'content-length': '4096' } },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: fixture.sha,
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl: fixture.fetchImpl,
      maxResponseBytes: 1024,
    }), /response exceeds 1024 bytes/);
  });

  await t.test('streamed response size', async () => {
    const chunks = [new Uint8Array(800), new Uint8Array(800)];
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          return {
            async read() {
              return chunks.length > 0 ? { done: false, value: chunks.shift() } : { done: true };
            },
            async cancel() {},
          };
        },
      },
      async text() {
        throw new Error('collector must stream bounded responses');
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: 'a'.repeat(40),
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl,
      maxAttempts: 1,
      maxResponseBytes: 1024,
    }), /response exceeds 1024 bytes/);
  });
});

test('requires the latest exact-SHA push pipeline and unexpired retained artifacts', async (t) => {
  const sha = 'a'.repeat(40);
  const pipelineRoute = `/projects/42/pipelines?ref=master&sha=${sha}&per_page=20`;

  await t.test('latest pipeline', async () => {
    const fixture = createApiFixture({
      routes: {
        [pipelineRoute]: [
          { id: 100, sha, ref: 'master', status: 'failed', source: 'push' },
          { id: 99, sha, ref: 'master', status: 'success', source: 'push' },
        ],
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: fixture.sha,
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl: fixture.fetchImpl,
    }), /Latest exact-SHA pipeline must be successful/);
  });

  await t.test('pipeline source', async () => {
    const fixture = createApiFixture({
      routes: {
        '/projects/42/pipelines/99': { id: 99, sha, ref: 'master', status: 'success', source: 'web' },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: fixture.sha,
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl: fixture.fetchImpl,
    }), /source must be push/);
  });

  await t.test('artifact expiry', async () => {
    const fixture = createApiFixture({
      jobs: { 'web:contract': { artifacts_expire_at: '2020-01-01T00:00:00Z' } },
      routes: {
        '/projects/42/pipelines/70': { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule', updated_at: '2026-07-16T12:00:00Z' },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: fixture.sha,
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl: fixture.fetchImpl,
      now: () => new Date('2026-07-17T00:00:00Z'),
    }), /retained artifact for web:contract is expired/);
  });

  await t.test('numeric project identity', async () => {
    const fixture = createApiFixture({
      routes: {
        '/projects/AI%2FHappy-AgentRemote': { id: '../other', path_with_namespace: 'AI/Happy-AgentRemote', default_branch: 'master', only_allow_merge_if_pipeline_succeeds: true },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4',
      projectPath: 'AI/Happy-AgentRemote',
      expectedSha: fixture.sha,
      token: 'secret',
      tokenHeader: 'PRIVATE-TOKEN',
      policy,
      fetchImpl: fixture.fetchImpl,
    }), /project id must be a positive integer/);
  });

  await t.test('numeric schedule identity', async () => {
    const route = '/projects/42/pipeline_schedules?per_page=100';
    const fixture = createApiFixture({
      routes: { [route]: [{ id: '7', ref: 'master', active: true }] },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /pipeline schedule id must be a positive integer/);
  });

  await t.test('numeric pipeline identity', async () => {
    const fixture = createApiFixture({
      routes: { [pipelineRoute]: [{ id: '99', sha, ref: 'master', status: 'success' }] },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /GitLab pipeline id must be a positive integer/);
  });

  await t.test('numeric required-job identity', async () => {
    const fixture = createApiFixture({ jobs: { validate: { id: '103' } } });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /required job validate id must be a positive integer/);
  });

  await t.test('valid artifact expiry metadata', async () => {
    const fixture = createApiFixture({ jobs: { 'web:contract': { artifacts_expire_at: 'not-a-date' } } });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /retained artifact for web:contract has invalid expiry metadata/);
  });
});

test('requires protected schedule variables that enable every schedule-only gate', async () => {
  const fixture = createApiFixture({
    routes: {
      '/projects/42/pipeline_schedules/7': {
        id: 7,
        ref: 'master',
        active: true,
        variables: [{ key: 'AGENTHUB_PROVIDER_MATRIX', value: 'false', variable_type: 'env_var' }],
      },
    },
  });
  await assert.rejects(() => collectGitLabReleaseEvidence({
    apiBaseUrl: 'https://gitlab.invalid/api/v4',
    projectPath: 'AI/Happy-AgentRemote',
    expectedSha: fixture.sha,
    token: 'secret',
    tokenHeader: 'PRIVATE-TOKEN',
    policy,
    fetchImpl: fixture.fetchImpl,
  }), /schedule variable AGENTHUB_PROVIDER_MATRIX must equal true/);
});

test('requires the latest scheduled pipeline, every scheduled job, and retained schedule artifacts', async (t) => {
  const scheduleDetailRoute = '/projects/42/pipeline_schedules/7';
  const scheduleJobsRoute = '/projects/42/pipelines/70/jobs?per_page=100&include_retried=true';

  await t.test('latest scheduled pipeline', async () => {
    const fixture = createApiFixture({
      routes: {
        [scheduleDetailRoute]: { id: 7, ref: 'master', active: true, variables: [{ key: 'AGENTHUB_PROVIDER_MATRIX', value: 'true', variable_type: 'env_var' }], last_pipeline: { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'failed', source: 'schedule' } },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /latest scheduled pipeline must be successful/);
  });

  await t.test('scheduled job cannot skip', async () => {
    const fixture = createApiFixture({
      routes: {
        [scheduleJobsRoute]: [{ id: 700, name: 'provider:matrix', status: 'skipped', allow_failure: false, artifacts_expire_at: null, artifacts: [{ file_type: 'archive', size: 123 }] }],
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /scheduled job provider:matrix must exist, succeed, and disallow failure/);
  });

  await t.test('scheduled artifact must remain retained', async () => {
    const fixture = createApiFixture({
      routes: {
        '/projects/42/pipelines/70': { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule', updated_at: '2026-07-16T12:00:00Z' },
        [scheduleJobsRoute]: [{ id: 700, name: 'provider:matrix', status: 'success', allow_failure: false, artifacts_expire_at: '2020-01-01T00:00:00Z', artifacts: [{ file_type: 'archive', size: 123 }] }],
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
      now: () => new Date('2026-07-17T00:00:00Z'),
    }), /retained artifact for scheduled job provider:matrix is expired/);
  });

  await t.test('scheduled pipeline must be recent', async () => {
    const fixture = createApiFixture({
      routes: {
        '/projects/42/pipelines/70': { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:30:00Z' },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
      now: () => new Date('2026-07-17T00:00:00Z'),
      scheduleMaxAgeHours: 48,
    }), /latest scheduled pipeline is older than 48 hours/);
  });

  await t.test('scheduled pipeline timestamp must be valid', async () => {
    const fixture = createApiFixture({
      routes: {
        '/projects/42/pipelines/70': { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule', updated_at: 'not-a-date' },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
    }), /latest scheduled pipeline has invalid updated_at/);
  });

  await t.test('scheduled pipeline timestamp cannot be in the future', async () => {
    const fixture = createApiFixture({
      routes: {
        '/projects/42/pipelines/70': { id: 70, sha: 'c'.repeat(40), ref: 'master', status: 'success', source: 'schedule', updated_at: '2026-07-18T00:00:00Z' },
      },
    });
    await assert.rejects(() => collectGitLabReleaseEvidence({
      apiBaseUrl: 'https://gitlab.invalid/api/v4', projectPath: 'AI/Happy-AgentRemote', expectedSha: fixture.sha,
      token: 'secret', tokenHeader: 'PRIVATE-TOKEN', policy, fetchImpl: fixture.fetchImpl,
      now: () => new Date('2026-07-17T00:00:00Z'),
    }), /latest scheduled pipeline updated_at is in the future/);
  });
});

test('fails closed for a missing active schedule, required job, retained artifact, or exact SHA', async (t) => {
  const cases = [
    ['schedule', { routes: { '/projects/42/pipeline_schedules?per_page=100': [] } }, /active master pipeline schedule/],
    ['job', { jobs: { validate: { status: 'failed' } } }, /required job validate/],
    ['artifact', { jobs: { 'web:contract': { artifacts: [], artifacts_expire_at: null } } }, /retained artifact for web:contract/],
    ['sha', { routes: { [`/projects/42/pipelines?ref=master&sha=${'a'.repeat(40)}&per_page=20`]: [] } }, /pipeline for exact SHA/],
  ];
  for (const [name, overrides, pattern] of cases) {
    await t.test(name, async () => {
      const fixture = createApiFixture(overrides);
      await assert.rejects(() => collectGitLabReleaseEvidence({
        apiBaseUrl: 'https://gitlab.invalid/api/v4',
        projectPath: 'AI/Happy-AgentRemote',
        expectedSha: fixture.sha,
        token: 'secret',
        tokenHeader: 'PRIVATE-TOKEN',
        policy,
        fetchImpl: fixture.fetchImpl,
      }), pattern);
    });
  }
});

test('writes evidence atomically with private permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-gitlab-evidence-'));
  const output = join(dir, 'nested', 'evidence.json');
  writePrivateJsonAtomic(output, { status: 'passed' });
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { status: 'passed' });
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, 'nested')).mode & 0o777, 0o700);
});

test('rejects a symlinked evidence output parent without writing outside the requested tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-gitlab-evidence-link-'));
  const external = join(dir, 'external');
  const linkedParent = join(dir, 'linked-parent');
  mkdirSync(external);
  symlinkSync(external, linkedParent, 'dir');

  assert.throws(
    () => writePrivateJsonAtomic(join(linkedParent, 'evidence.json'), { status: 'passed' }),
    /symbolic link/,
  );
  assert.equal(existsSync(join(external, 'evidence.json')), false);
});

test('resolves credentials from environment without accepting an ambiguous or incomplete release target', () => {
  assert.equal(rootPackage.scripts['gitlab:evidence'], 'node scripts/gitlabReleaseEvidence.cjs');
  assert.equal(rootPackage.scripts['gitlab:evidence:test'], 'node --test scripts/gitlabReleaseEvidence.test.cjs');
  assert.match(rootPackage.scripts['ci:verify'], /pnpm gitlab:evidence:test/);
  assert.deepEqual(resolveGitLabEvidenceConfig({
    CI_API_V4_URL: 'https://gitlab.invalid/api/v4',
    CI_SERVER_URL: 'https://gitlab.invalid',
    CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
    CI_COMMIT_SHA: 'b'.repeat(40),
    GITLAB_TOKEN: 'private-token',
  }), {
    apiBaseUrl: 'https://gitlab.invalid/api/v4',
    projectPath: 'AI/Happy-AgentRemote',
    expectedSha: 'b'.repeat(40),
    token: 'private-token',
    tokenHeader: 'PRIVATE-TOKEN',
    outputPath: join(process.cwd(), 'reports', 'gitlab', 'release-evidence.json'),
    requestTimeoutMs: 15_000,
    maxAttempts: 3,
    retryDelayMs: 250,
    maxResponseBytes: 2 * 1024 * 1024,
    scheduleMaxAgeHours: 48,
  });
  const bounded = resolveGitLabEvidenceConfig({
    CI_API_V4_URL: 'https://gitlab.invalid/api/v4',
    CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
    CI_COMMIT_SHA: 'b'.repeat(40),
    GITLAB_TOKEN: 'private-token',
    GITLAB_EVIDENCE_TIMEOUT_MS: '5000',
    GITLAB_EVIDENCE_MAX_ATTEMPTS: '2',
    GITLAB_EVIDENCE_RETRY_DELAY_MS: '10',
    GITLAB_EVIDENCE_MAX_RESPONSE_BYTES: '1048576',
    GITLAB_EVIDENCE_SCHEDULE_MAX_AGE_HOURS: '72',
  });
  assert.equal(bounded.requestTimeoutMs, 5000);
  assert.equal(bounded.maxAttempts, 2);
  assert.equal(bounded.retryDelayMs, 10);
  assert.equal(bounded.maxResponseBytes, 1048576);
  assert.equal(bounded.scheduleMaxAgeHours, 72);
  assert.throws(() => resolveGitLabEvidenceConfig({}), /CI_API_V4_URL/);
  assert.throws(() => resolveGitLabEvidenceConfig({
    CI_API_V4_URL: 'https://gitlab.invalid/api/v4',
    CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
    CI_COMMIT_SHA: 'not-a-sha',
    GITLAB_TOKEN: 'secret',
  }), /40-character commit SHA/);
  assert.throws(() => resolveGitLabEvidenceConfig({
    CI_API_V4_URL: 'https://gitlab.invalid/api/v4',
    CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
    CI_COMMIT_SHA: 'b'.repeat(40),
    GITLAB_TOKEN: 'secret',
    GITLAB_EVIDENCE_TIMEOUT_MS: '0',
  }), /GITLAB_EVIDENCE_TIMEOUT_MS/);
  assert.throws(() => resolveGitLabEvidenceConfig({
    CI_API_V4_URL: 'https://gitlab.invalid/api/v4',
    CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
    CI_COMMIT_SHA: 'b'.repeat(40),
    GITLAB_TOKEN: 'secret',
    GITLAB_EVIDENCE_SCHEDULE_MAX_AGE_HOURS: '0',
  }), /GITLAB_EVIDENCE_SCHEDULE_MAX_AGE_HOURS/);
  for (const invalidUrl of [
    'https://user:password@gitlab.invalid/api/v4',
    'https://gitlab.invalid/api/v4?token=secret',
    'https://gitlab.invalid/api/v4#fragment',
    'https://gitlab.invalid/not-api',
  ]) {
    assert.throws(() => resolveGitLabEvidenceConfig({
      CI_API_V4_URL: invalidUrl,
      CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
      CI_COMMIT_SHA: 'b'.repeat(40),
      GITLAB_TOKEN: 'secret',
    }), /CI_API_V4_URL/);
  }
  assert.throws(() => resolveGitLabEvidenceConfig({
    CI_API_V4_URL: 'https://gitlab.invalid/api/v4',
    CI_PROJECT_PATH: 'AI/../other',
    CI_COMMIT_SHA: 'b'.repeat(40),
    GITLAB_TOKEN: 'secret',
  }), /CI_PROJECT_PATH/);
});

test('binds authenticated GitLab requests and evidence output to the canonical CI target', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'agenthub-gitlab-project-'));
  const base = {
    CI_API_V4_URL: 'https://gitlab.invalid/gitlab/api/v4',
    CI_SERVER_URL: 'https://gitlab.invalid/gitlab',
    CI_PROJECT_DIR: projectDir,
    CI_PROJECT_PATH: 'AI/Happy-AgentRemote',
    CI_COMMIT_SHA: 'b'.repeat(40),
    GITLAB_TOKEN: 'secret',
  };

  assert.equal(
    resolveGitLabEvidenceConfig({ ...base, GITLAB_EVIDENCE_OUTPUT: 'reports/evidence.json' }).outputPath,
    join(projectDir, 'reports', 'evidence.json'),
  );
  assert.throws(() => resolveGitLabEvidenceConfig({
    ...base,
    CI_API_V4_URL: 'https://attacker.invalid/api/v4',
  }), /same origin as CI_SERVER_URL/);
  assert.throws(() => resolveGitLabEvidenceConfig({
    ...base,
    GITLAB_EVIDENCE_OUTPUT: '../outside.json',
  }), /GITLAB_EVIDENCE_OUTPUT/);
  assert.throws(() => resolveGitLabEvidenceConfig({
    ...base,
    GITLAB_EVIDENCE_OUTPUT: join(tmpdir(), 'outside.json'),
  }), /GITLAB_EVIDENCE_OUTPUT/);
});
