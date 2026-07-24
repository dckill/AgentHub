import { describe, expect, it } from 'vitest';
import { getDaemonBundleReplacementRestartMode } from './restartPolicy';

describe('getDaemonBundleReplacementRestartMode', () => {
    it('delegates bundle replacement restarts to systemd when launched as a unit', () => {
        expect(getDaemonBundleReplacementRestartMode({ INVOCATION_ID: 'unit-run' })).toBe('systemd');
        expect(getDaemonBundleReplacementRestartMode({ SYSTEMD_EXEC_PID: '1234' })).toBe('systemd');
    });

    it('self-spawns a replacement daemon when not supervised by systemd', () => {
        expect(getDaemonBundleReplacementRestartMode({})).toBe('self-spawn');
    });
});
