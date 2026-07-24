import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';

export const AGENTHUB_DAEMON_SERVICE_NAME = 'agenthub-daemon';
const SYSTEMD_DIR = join(homedir(), '.config', 'systemd', 'user');
const SERVICE_FILE = getLinuxSystemdServiceFile(homedir());

export function getLinuxSystemdServiceFile(homeDir: string): string {
    return join(homeDir, '.config', 'systemd', 'user', `${AGENTHUB_DAEMON_SERVICE_NAME}.service`);
}

export function buildLinuxSystemdServiceContent({
    nodeExec,
    entrypoint,
    homeDir,
}: {
    nodeExec: string;
    entrypoint: string;
    homeDir: string;
}): string {
    return `[Unit]
Description=AgentHub CLI Daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodeExec} --no-warnings --no-deprecation ${entrypoint} daemon start-sync
Restart=on-failure
RestartSec=5
KillMode=process
Environment=HOME=${homeDir}

[Install]
WantedBy=default.target
`;
}

export async function install(): Promise<void> {
    try {
        const nodeExec = process.execPath;
        const entrypoint = join(projectPath(), 'dist', 'index.mjs');
        const serviceContent = buildLinuxSystemdServiceContent({
            nodeExec,
            entrypoint,
            homeDir: homedir(),
        });

        mkdirSync(SYSTEMD_DIR, { recursive: true });

        // 如果已存在先停止旧的
        if (existsSync(SERVICE_FILE)) {
            logger.info('systemd 服务文件已存在，先停止旧服务...');
            try {
                execSync(`systemctl --user stop ${AGENTHUB_DAEMON_SERVICE_NAME}.service`, { stdio: 'pipe' });
                execSync(`systemctl --user disable ${AGENTHUB_DAEMON_SERVICE_NAME}.service`, { stdio: 'pipe' });
            } catch {
                // 旧服务可能未运行
            }
        }

        writeFileSync(SERVICE_FILE, serviceContent, 'utf8');
        logger.info(`已创建 systemd 用户服务: ${SERVICE_FILE}`);

        execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
        execSync(`systemctl --user enable --now ${AGENTHUB_DAEMON_SERVICE_NAME}.service`, { stdio: 'inherit' });

        // 尝试启用 linger，让服务在未登录时也能运行
        try {
            execSync(`loginctl enable-linger ${process.env.USER || ''}`, { stdio: 'pipe' });
            logger.info('已启用 linger（daemon 将在开机时自动启动）');
        } catch {
            logger.info('提示：需要管理员权限才能启用 linger（开机自启动）。当前已配置为用户登录时自启动。');
        }

        logger.info('AgentHub daemon 已安装为 systemd 用户服务');
    } catch (error) {
        logger.debug('systemd 用户服务安装失败:', error);
        throw error;
    }
}
