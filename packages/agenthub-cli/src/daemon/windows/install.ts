import { execFileSync } from 'child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'path';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';
import { configuration } from '@/configuration';
import {
    buildWindowsDaemonLauncherScript,
    buildWindowsDaemonTaskAction,
    getWindowsDaemonLauncherPath,
} from './launcher';

const TASK_NAME = 'AgentHubDaemon';

export async function install(): Promise<void> {
    try {
        const nodeExec = process.execPath;
        const entrypoint = join(projectPath(), 'dist', 'index.mjs');
        const launcherPath = getWindowsDaemonLauncherPath(configuration.agentHubHomeDir);
        writeFileSync(
            launcherPath,
            buildWindowsDaemonLauncherScript(nodeExec, entrypoint),
            { encoding: 'utf8', mode: 0o600 },
        );

        // 先删除已存在的同名任务
        try {
            execFileSync('schtasks', ['/delete', '/tn', TASK_NAME, '/f'], { stdio: 'pipe' });
        } catch {
            // 任务不存在
        }

        // 隐藏的 PowerShell 宿主前台托管 daemon，避免登录后弹出 Node.js 控制台窗口。
        execFileSync('schtasks', [
            '/create',
            '/tn', TASK_NAME,
            '/tr', buildWindowsDaemonTaskAction(launcherPath),
            '/sc', 'onlogon',
            '/rl', 'limited',
            '/f',
        ], { stdio: 'inherit' });

        logger.info('AgentHub daemon 已安装为 Windows 计划任务，将在用户登录时自动启动');
    } catch (error) {
        logger.debug('Windows 计划任务安装失败:', error);
        throw error;
    }
}
