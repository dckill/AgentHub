import { describe, expect, it } from 'vitest';
import { AGENTHUB_DAEMON_SERVICE_NAME, buildLinuxSystemdServiceContent, getLinuxSystemdServiceFile } from './install';

describe('linux daemon systemd service', () => {
    it('uses the AgentHub daemon service name', () => {
        expect(AGENTHUB_DAEMON_SERVICE_NAME).toBe('agenthub-daemon');
        expect(getLinuxSystemdServiceFile('/home/tester')).toBe('/home/tester/.config/systemd/user/agenthub-daemon.service');
    });

    it('does not let systemd stop kill daemon-spawned agent sessions', () => {
        const service = buildLinuxSystemdServiceContent({
            nodeExec: '/usr/bin/node',
            entrypoint: '/opt/agenthub/dist/index.mjs',
            homeDir: '/home/tester',
        });

        expect(service).toContain('KillMode=process');
        expect(service).toContain(
            'ExecStart=/usr/bin/node --no-warnings --no-deprecation /opt/agenthub/dist/index.mjs daemon start-sync',
        );
        expect(service).toContain('Environment=HOME=/home/tester');
    });
});
