import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('side chat lifecycle boundary', () => {
    it('isSideChat 从 Wire/App RPC 贯通到 daemon 环境变量', () => {
        expect(read('agenthub-wire/src/rpc.ts')).toContain('isSideChat: z.boolean().optional()');
        expect(read('agenthub-app/sources/sync/ops.ts')).toContain('isSideChat?: boolean');
        expect(read('agenthub-cli/src/api/apiMachine.ts')).toContain('isSideChat');
        expect(read('agenthub-cli/src/daemon/run.ts')).toContain("AGENTHUB_SIDE_CHAT = '1'");
    });

    it('Claude 与 Codex 都写入 side chat 元数据并跳过历史 UI 回放', () => {
        const claude = read('agenthub-cli/src/claude/runClaude.ts');
        const codex = read('agenthub-cli/src/codex/runCodex.ts');
        expect(claude).toContain("process.env.AGENTHUB_SIDE_CHAT === '1'");
        expect(claude).toContain('forkClaudeSessionId && !isSideChat');
        expect(claude).toContain('forkClaudeSessionId && isSideChat');
        expect(codex).toContain("process.env.AGENTHUB_SIDE_CHAT === '1'");
        expect(codex).toContain('skipInitialHistory: isSideChat');
        expect(codex).toContain('announce: !isSideChat');
    });

    it('App 具备持久化面板、隐藏子会话、创建与关闭完整链路', () => {
        expect(read('agenthub-app/sources/sync/localSettings.ts')).toContain('sidebarPanelsOpen');
        expect(read('agenthub-app/sources/sync/storage.ts')).toContain('useSideChatSessions');
        expect(read('agenthub-app/sources/sync/ops.ts')).toContain('spawnSideChat');
        expect(read('agenthub-app/sources/components/SessionWorkbenchSidebar.tsx')).toContain('SideChatPanel');
        expect(read('agenthub-app/sources/components/SessionWorkbenchSidebar.tsx')).toContain('runSessionActionRequest');
        expect(read('agenthub-app/sources/components/SessionWorkbenchSidebar.tsx')).toContain('closeAllSideChats');
        const sessionView = read('agenthub-app/sources/-session/SessionView.tsx');
        expect(sessionView).toContain('renderSideChat');
        expect(sessionView).toContain('SessionViewLoaded');
        expect(sessionView).toContain("session.metadata?.isSideChat !== true");
    });
});
