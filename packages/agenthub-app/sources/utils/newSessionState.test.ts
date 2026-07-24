import { describe, expect, it } from 'vitest';
import {
    getAvailableNewSessionAgents,
    getNextNewSessionAgentKey,
    shouldShowCredentialSelectorRow,
    shouldClearSelectedCredential,
    getNewSessionConfigItems,
} from './newSessionState';

describe('newSessionState', () => {
    it('falls back to all agents when machine availability reports none installed', () => {
        const agents = getAvailableNewSessionAgents({
            claude: false,
            codex: false,
            detectedAt: 1,
        });

        expect(agents.map(agent => agent.key)).toEqual(['claude', 'codex']);
    });

    it('cycles safely even when the current agent is unavailable', () => {
        const agents = getAvailableNewSessionAgents({
            claude: false,
            codex: true,
            detectedAt: 1,
        });

        expect(getNextNewSessionAgentKey(agents, 'claude')).toBe('codex');
    });

    it('clears credentials that do not belong to the selected agent', () => {
        expect(shouldClearSelectedCredential([
            { id: 'cred-1', agent: 'claude' },
        ], 'cred-1', 'codex')).toBe(true);

        expect(shouldClearSelectedCredential([
            { id: 'cred-1', agent: 'claude' },
        ], 'cred-1', 'claude')).toBe(false);
    });

    it('shows the credential selector even before credentials have been created', () => {
        expect(shouldShowCredentialSelectorRow([], 'claude')).toBe(true);
        expect(shouldShowCredentialSelectorRow([{ id: 'codex-key', agent: 'codex' }], 'claude')).toBe(true);
    });

    it('separates core setup choices from advanced options', () => {
        const items = getNewSessionConfigItems({
            machineName: 'agenthub-devbox',
            machineOnline: true,
            pathName: '~/workspace/agenthub',
            agentLabel: 'codex',
            modelName: 'gpt-5.3-codex',
            effortName: 'high',
            permissionName: 'read only',
            credentialLabel: 'Use host credentials',
            worktreeLabel: 'no worktree',
            showModel: true,
            showEffort: true,
            showPermission: true,
            showCredential: true,
            showWorktree: true,
        });

        expect(items.filter(item => item.priority === 'primary').map(item => item.key)).toEqual([
            'machine',
            'path',
            'agent',
        ]);
        expect(items.filter(item => item.priority === 'advanced').map(item => item.key)).toEqual([
            'permission',
            'credential',
            'worktree',
        ]);
        expect(items.every(item => item.title.length > 0 && item.description.length > 0 && item.value.length > 0)).toBe(true);
        expect(items.find(item => item.key === 'agent')?.value).toContain('gpt-5.3-codex');
        expect(items.find(item => item.key === 'agent')?.value).toContain('high');
    });

    it('uses localized labels for setup copy', () => {
        const copy: Record<string, string> = {
            'newSession.setup.machine.title': '设备',
            'newSession.setup.machine.description': '选择用于启动此会话的电脑。',
            'newSession.setup.path.title': '工作目录',
            'newSession.setup.path.description': 'AgentHub 会将此项目目录作为起始上下文。',
            'newSession.setup.agent.title': '代理与模型',
            'newSession.setup.agent.description': '切换 CLI 代理、模型配置和推理强度。',
            'newSession.setup.permission.title': '权限模式',
            'newSession.setup.permission.description': '控制编辑和命令是否需要确认。',
            'newSession.setup.credential.title': '凭据',
            'newSession.setup.credential.description': '使用主机凭据或选择保存的 API 凭据。',
            'newSession.setup.worktree.title': 'Git Worktree',
            'newSession.setup.worktree.description': '在当前目录、已有 worktree 或新分支中启动。',
        };

        const items = getNewSessionConfigItems({
            machineName: 'yzsd-gpu-server',
            machineOnline: true,
            pathName: '~',
            agentLabel: 'codex',
            modelName: '默认模型',
            effortName: '高',
            permissionName: '默认权限',
            credentialLabel: '使用主机凭据',
            worktreeLabel: '无 worktree',
            showModel: true,
            showEffort: true,
            showPermission: true,
            showCredential: true,
            showWorktree: true,
            translate: (key) => copy[key],
        });

        expect(items.map(item => item.title)).toEqual([
            '设备',
            '工作目录',
            '代理与模型',
            '权限模式',
            '凭据',
            'Git Worktree',
        ]);
        expect(items.find(item => item.key === 'path')?.description).toBe('AgentHub 会将此项目目录作为起始上下文。');
    });
});
