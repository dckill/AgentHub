import { logger } from '@/ui/logger';
import { uninstall as uninstallMac } from './mac/uninstall';
import { uninstall as uninstallLinux } from './linux/uninstall';
import { uninstall as uninstallWindows } from './windows/uninstall';

export async function uninstall(): Promise<void> {
    const platform = process.platform;

    if (platform === 'darwin') {
        logger.info('正在卸载 macOS LaunchAgent...');
        await uninstallMac();
    } else if (platform === 'linux') {
        logger.info('正在卸载 Linux systemd 用户服务...');
        await uninstallLinux();
    } else if (platform === 'win32') {
        logger.info('正在卸载 Windows 计划任务...');
        await uninstallWindows();
    } else {
        throw new Error(`不支持的平台: ${platform}`);
    }
}
