import { describe, expect, it } from 'vitest';
import type { Metadata } from './types';
import {
    getSessionNotificationBody,
    getSessionNotificationCopy,
    getSessionNotificationTitle,
} from './pushNotifications';

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
    return {
        path: '/Users/test/projects/agenthub',
        host: 'test-host',
        homeDir: '/Users/test',
        agentHubHomeDir: '/Users/test/.agenthub',
        agentHubLibDir: '/Users/test/.agenthub/lib',
        agentHubToolsDir: '/Users/test/.agenthub/tools',
        ...overrides,
    };
}

describe('getSessionNotificationTitle', () => {
    it('maps done notifications to a localized completion title', () => {
        expect(getSessionNotificationTitle('done')).toBe('✅ 任务完成');
    });

    it('maps permission notifications to a localized permission title', () => {
        expect(getSessionNotificationTitle('permission')).toBe('🔐 需要授权');
    });

    it('maps question notifications to a localized question title', () => {
        expect(getSessionNotificationTitle('question')).toBe('💬 需要你确认');
    });
});

describe('getSessionNotificationBody', () => {
    it('uses the project name and session summary when available', () => {
        const metadata = makeMetadata({
            name: 'AgentHub',
            summary: {
                text: 'Fix push notifications',
                updatedAt: 1,
            }
        });

        expect(getSessionNotificationBody(metadata)).toBe('AgentHub · Fix push notifications');
    });

    it('uses the path project name when metadata name is missing', () => {
        const metadata = makeMetadata({
            path: '/Users/test/projects/agenthub-cli',
        });

        expect(getSessionNotificationBody(metadata)).toBe('agenthub-cli');
    });

    it('falls back to a generic label when metadata is missing', () => {
        expect(getSessionNotificationBody(null)).toBe('会话');
    });

    it('includes permission request detail from notification data', () => {
        const metadata = makeMetadata({
            name: 'AgentHub',
            summary: {
                text: 'Android 打包',
                updatedAt: 1,
            }
        });

        expect(getSessionNotificationBody(metadata, {
            provider: 'codex',
            tool: 'git status && pnpm test',
        })).toBe('AgentHub · Android 打包 · Codex 请求执行：git status && pnpm test');
    });

    it('includes question request detail from notification data', () => {
        const metadata = makeMetadata({
            name: 'AgentHub',
            summary: {
                text: '推送配置',
                updatedAt: 1,
            }
        });

        expect(getSessionNotificationBody(metadata, {
            provider: 'claude',
            tool: 'AskUserQuestion',
        })).toBe('AgentHub · 推送配置 · Claude Code 需要你确认');
    });
});

describe('getSessionNotificationCopy', () => {
    it('returns the localized title and enriched body', () => {
        const metadata = makeMetadata({
            name: 'AgentHub',
            summary: {
                text: 'Fix push notifications',
                updatedAt: 1,
            }
        });

        expect(getSessionNotificationCopy('done', metadata)).toEqual({
            title: '✅ 任务完成',
            body: 'AgentHub · Fix push notifications',
        });
    });
});
