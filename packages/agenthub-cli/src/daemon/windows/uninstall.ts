import { execFileSync } from 'child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { logger } from '@/ui/logger';
import { configuration } from '@/configuration';
import { getWindowsDaemonLauncherPath } from './launcher';

const TASK_NAME = 'AgentHubDaemon';

export async function uninstall(): Promise<void> {
    try {
        execFileSync('schtasks', ['/delete', '/tn', TASK_NAME, '/f'], { stdio: 'inherit' });
        const launcherPath = getWindowsDaemonLauncherPath(configuration.agentHubHomeDir);
        if (existsSync(launcherPath)) unlinkSync(launcherPath);
        logger.info('已删除 Windows 计划任务');
        logger.info('AgentHub daemon 自启动已卸载');
    } catch (error) {
        logger.debug('Windows 计划任务卸载失败:', error);
        throw error;
    }
}
