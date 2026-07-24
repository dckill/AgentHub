import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..', '..');

function readRoadmap() {
    return readFileSync(join(repoRoot, 'docs', 'upstream-integration-and-brand-roadmap.md'), 'utf8');
}

describe('upstream integration and brand roadmap status', () => {
    it('records AgentHub 1.0 as the current maintained baseline', () => {
        const roadmap = readRoadmap();

        expect(roadmap).toContain('产品名：`AgentHub`');
        expect(roadmap).toContain('默认服务端：`https://agenthub.yzsd.asia:8443`');
        expect(roadmap).toContain('Android production：`com.artsum.agenthub`');
        expect(roadmap).toContain('设计事实源：`design/Design.md`');
    });

    it('keeps upstream as a source of manually reviewed features, not a merge base', () => {
        const roadmap = readRoadmap();

        expect(roadmap).toContain('上游 `slopus/happy` 只作为特性素材库');
        expect(roadmap).toContain('git merge upstream/main');
        expect(roadmap).toContain('`git cherry-pick -n <sha>` 作为临时取 diff 手段');
    });

    it('defines current no-compat runtime and V02 native evidence rules', () => {
        const roadmap = readRoadmap();

        expect(roadmap).toContain('不保留旧 Happy/Handy 运行兼容');
        expect(roadmap).toContain('使用 `AGENTHUB_*`');
        expect(roadmap).toContain('使用 `agenthub-daemon.service`、`agenthub-server.service`');
        expect(roadmap).toContain('`readyToMarkV02Done: true`');
        expect(roadmap).toContain('`design/Design.md`、`docs/project-status.md` 和 `docs/validation-coverage.md`');
    });
});
