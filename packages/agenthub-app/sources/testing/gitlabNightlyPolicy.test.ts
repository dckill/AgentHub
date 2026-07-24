import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const pipelinePath = resolve(__dirname, '../../../../.gitlab-ci.yml');

describe('GitLab App nightly policy', () => {
    it('runs the reproducible flake suite only for scheduled pipelines and preserves every JUnit report', () => {
        expect(existsSync(pipelinePath)).toBe(true);
        if (!existsSync(pipelinePath)) return;

        const pipeline = parse(readFileSync(pipelinePath, 'utf8')) as any;
        const job = pipeline['app:nightly'];
        expect(job.rules).toEqual([{ if: '$CI_PIPELINE_SOURCE == "schedule"' }]);
        expect(job.script).toContain('pnpm --filter agenthub-app test:flake');
        expect(job.variables.AGENTHUB_FLAKE_RUNS).toBe('5');
        expect(job.artifacts.when).toBe('always');
        expect(job.artifacts.reports.junit).toContain('packages/agenthub-app/reports/flake/*.xml');
        expect(job.retry).toBeUndefined();
        expect(job.allow_failure).toBe(false);
    });

    it('runs frozen installation, repository checks, App unit and coverage on master and merge requests', () => {
        const pipeline = parse(readFileSync(pipelinePath, 'utf8')) as any;
        expect(pipeline.default.before_script).toContain('pnpm install --frozen-lockfile');
        expect(pipeline['.required'].rules).toEqual([
            { if: '$CI_PIPELINE_SOURCE == "merge_request_event"' },
            { if: '$CI_COMMIT_BRANCH == "master"' },
        ]);
        expect(pipeline.validate.extends).toBe('.required');
        expect(pipeline.validate.script).toEqual(['pnpm dependency-boundary:test', 'pnpm check']);
        expect(pipeline['app:test'].extends).toBe('.required');
        expect(pipeline['app:test'].script).toEqual(['pnpm --filter agenthub-app test:ci']);
        expect(pipeline['app:test'].artifacts.reports.junit).toContain('packages/agenthub-app/reports/junit.xml');
        expect(pipeline['app:test'].artifacts.paths).toContain('packages/agenthub-app/coverage/');
        expect(pipeline.validate.allow_failure).toBe(false);
        expect(pipeline['app:test'].allow_failure).toBe(false);
    });
});
