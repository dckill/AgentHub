import { logger } from '@/ui/logger';
import { install as installMac } from './mac/install';
import { install as installLinux } from './linux/install';
import { install as installWindows } from './windows/install';

export async function install(): Promise<void> {
    const platform = process.platform;

    if (platform === 'darwin') {
        logger.info('正在为 macOS 安装 AgentHub daemon 自启动 (LaunchAgent)...');
        await installMac();
    } else if (platform === 'linux') {
        logger.info('正在为 Linux 安装 AgentHub daemon 自启动 (systemd --user)...');
        await installLinux();
    } else if (platform === 'win32') {
        logger.info('正在为 Windows 安装 AgentHub daemon 自启动 (计划任务)...');
        await installWindows();
    } else {
        throw new Error(`不支持的平台: ${platform}`);
    }
}
