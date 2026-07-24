import { existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '@/ui/logger';

const PLIST_LABEL = 'com.agenthub-cli.daemon';
const PLIST_FILE = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);

export async function uninstall(): Promise<void> {
    try {
        if (!existsSync(PLIST_FILE)) {
            logger.info('LaunchAgent 未安装，无需卸载');
            return;
        }

        try {
            execSync(`launchctl bootout gui/$(id -u)/${PLIST_LABEL}`, { stdio: 'pipe' });
            logger.info('已停止 LaunchAgent');
        } catch {
            try {
                execSync(`launchctl unload ${PLIST_FILE}`, { stdio: 'pipe' });
                logger.info('已停止 LaunchAgent');
            } catch {
                logger.info('LaunchAgent 未在运行，继续卸载');
            }
        }

        unlinkSync(PLIST_FILE);
        logger.info(`已删除 LaunchAgent: ${PLIST_FILE}`);
        logger.info('AgentHub daemon 自启动已卸载');
    } catch (error) {
        logger.debug('LaunchAgent 卸载失败:', error);
        throw error;
    }
}
