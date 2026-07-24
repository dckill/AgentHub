import { existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '@/ui/logger';

const SERVICE_NAME = 'agenthub-daemon';
const SERVICE_FILE = join(homedir(), '.config', 'systemd', 'user', `${SERVICE_NAME}.service`);

export async function uninstall(): Promise<void> {
    try {
        if (!existsSync(SERVICE_FILE)) {
            logger.info('systemd 用户服务未安装，无需卸载');
            return;
        }

        try {
            execSync(`systemctl --user stop ${SERVICE_NAME}.service`, { stdio: 'pipe' });
        } catch {
            // 服务可能未运行
        }

        try {
            execSync(`systemctl --user disable ${SERVICE_NAME}.service`, { stdio: 'pipe' });
        } catch {
            // 服务可能未启用
        }

        unlinkSync(SERVICE_FILE);
        logger.info(`已删除 systemd 用户服务: ${SERVICE_FILE}`);

        execSync('systemctl --user daemon-reload', { stdio: 'inherit' });

        logger.info('AgentHub daemon 自启动已卸载');
    } catch (error) {
        logger.debug('systemd 用户服务卸载失败:', error);
        throw error;
    }
}
