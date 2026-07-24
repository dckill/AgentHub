import { describe, expect, it } from 'vitest';
import {
    buildIosNativeQaPlan,
    parseXcrunSimctlBootedDevices,
} from './iosNativeQaPlan';

describe('AgentHub iOS native QA plan', () => {
    it('parses booted iOS simulator devices from simctl json', () => {
        const devices = parseXcrunSimctlBootedDevices(JSON.stringify({
            devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [
                    {
                        name: 'iPhone 16 Pro',
                        udid: '11111111-2222-3333-4444-555555555555',
                        state: 'Booted',
                    },
                    {
                        name: 'iPhone SE',
                        udid: '66666666-7777-8888-9999-000000000000',
                        state: 'Shutdown',
                    },
                ],
                'com.apple.CoreSimulator.SimRuntime.watchOS-11-5': [
                    {
                        name: 'Apple Watch',
                        udid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
                        state: 'Booted',
                    },
                ],
            },
        }));

        expect(devices).toEqual([
            {
                name: 'iPhone 16 Pro',
                udid: '11111111-2222-3333-4444-555555555555',
                runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
            },
        ]);
    });

    it('creates an automated launch and log plan without graphical capture', () => {
        const plan = buildIosNativeQaPlan({
            appPath: '/repo/artifacts/AgentHubPreview.app',
            bundleIdentifier: 'com.artsum.agenthub',
            deviceId: '11111111-2222-3333-4444-555555555555',
            outputDir: '/repo/artifacts',
            timestamp: '20260705-0501',
        });

        expect(plan.screenshots).toEqual([]);
        expect(plan.securityCases).toEqual([
            'account-isolation',
            'delayed-response-abort',
            'offline-mermaid',
            'recovery-key-auth-cancel',
            'recovery-key-auth-success',
            'recovery-key-screen-capture',
            'recovery-key-background-hide',
            'recovery-key-clipboard-ttl',
        ]);
        expect(plan.commands.map((command) => command.label)).toEqual([
            'install app',
            'launch app',
            'wait after launch',
            'collect system log tail',
        ]);
        expect(plan.commands[0].args).toEqual([
            'simctl',
            'install',
            '11111111-2222-3333-4444-555555555555',
            '/repo/artifacts/AgentHubPreview.app',
        ]);
        expect(plan.commands.some((command) => command.args.includes('screenshot'))).toBe(false);
        expect(plan.commands.some((command) => command.args.includes('openurl'))).toBe(false);
    });
});
