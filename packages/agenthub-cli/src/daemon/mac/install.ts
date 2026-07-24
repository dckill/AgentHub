import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';

const PLIST_LABEL = 'com.agenthub-cli.daemon';
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents');
const PLIST_FILE = join(PLIST_DIR, `${PLIST_LABEL}.plist`);

export async function install(): Promise<void> {
    try {
        if (existsSync(PLIST_FILE)) {
            logger.info('LaunchAgent 已存在，先卸载...');
            try {
                execSync(`launchctl bootout gui/$(id -u)/${PLIST_LABEL}`, { stdio: 'pipe' });
            } catch {
                try {
                    execSync(`launchctl unload ${PLIST_FILE}`, { stdio: 'pipe' });
                } catch {
                    // 可能未加载，继续
                }
            }
        }

        mkdirSync(PLIST_DIR, { recursive: true });

        const nodeExec = process.execPath;
        const entrypoint = join(projectPath(), 'dist', 'index.mjs');
        const logDir = join(homedir(), '.agenthub', 'logs');

        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${nodeExec}</string>
        <string>--no-warnings</string>
        <string>--no-deprecation</string>
        <string>${entrypoint}</string>
        <string>daemon</string>
        <string>start-sync</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${join(logDir, 'daemon-stdout.log')}</string>

    <key>StandardErrorPath</key>
    <string>${join(logDir, 'daemon-stderr.log')}</string>

    <key>WorkingDirectory</key>
    <string>${homedir()}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${homedir()}</string>
    </dict>
</dict>
</plist>`;

        writeFileSync(PLIST_FILE, plistContent, 'utf8');
        logger.info(`已创建 LaunchAgent: ${PLIST_FILE}`);

        execSync(`launchctl bootstrap gui/$(id -u) ${PLIST_FILE}`, { stdio: 'inherit' });
        logger.info('AgentHub daemon 已安装为 LaunchAgent，将在登录时自动启动');
    } catch (error) {
        logger.debug('LaunchAgent 安装失败:', error);
        throw error;
    }
}
