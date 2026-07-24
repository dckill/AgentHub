import { describe, expect, it } from 'vitest';
import {
    buildAndroidNativeQaPlan,
    getPreferredAndroidDevice,
    parseAdbDevices,
} from './androidNativeQaPlan';

describe('AgentHub Android native QA plan', () => {
    it('parses adb devices output and ignores offline devices', () => {
        const devices = parseAdbDevices(`List of devices attached
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1
R5CW000000A            unauthorized usb:1-1 transport_id:2
192.168.1.10:5555      offline transport_id:3
`);

        expect(devices).toEqual([
            {
                id: 'emulator-5554',
                state: 'device',
                details: 'product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1',
            },
            {
                id: 'R5CW000000A',
                state: 'unauthorized',
                details: 'usb:1-1 transport_id:2',
            },
        ]);
    });

    it('prefers an explicitly requested ready Android device', () => {
        const devices = parseAdbDevices(`List of devices attached
emulator-5554 device product:sdk_gphone64_x86_64
R5CW000000A device usb:1-1
`);

        expect(getPreferredAndroidDevice(devices, 'R5CW000000A')?.id).toBe('R5CW000000A');
    });

    it('prefers an arm64 ready Android device when no explicit device is requested', () => {
        const devices = parseAdbDevices(`List of devices attached
emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa
R5CW000000A device usb:1-1
`);

        expect(getPreferredAndroidDevice(devices, undefined, new Map([
            ['emulator-5554', 'x86_64'],
            ['R5CW000000A', 'arm64-v8a'],
        ]))?.id).toBe('R5CW000000A');
    });

    it('creates a production smoke plan without relying on excluded dev routes', () => {
        const plan = buildAndroidNativeQaPlan({
            apkPath: '/repo/artifacts/agenthub-production-arm64-latest.apk',
            packageName: 'com.artsum.agenthub',
            deviceId: 'R5CW000000A',
            outputDir: '/repo/artifacts',
            timestamp: '20260705-0412',
            qaProfile: 'production-smoke',
        });

        expect(plan.qaProfile).toBe('production-smoke');
        expect(plan.screenshots).toEqual([]);
        expect(plan.commands.map((command) => command.label)).toEqual([
            'install apk',
            'clear app logcat',
            'launch app',
            'wait after launch',
            'verify launch foreground activity',
            'verify production content',
            'collect logcat tail',
        ]);
        expect(plan.commands.find((command) => command.label === 'verify production content')?.expectedStdoutIncludes).toBe('AgentHub');
        expect(plan.commands.flatMap((command) => command.args).some((arg) => arg.includes('agenthub://dev/'))).toBe(false);
        expect(plan.commands.at(-1)).toMatchObject({
            allowFailure: false,
            forbiddenStdoutIncludes: [
                'ANR in com.artsum.agenthub',
                'FATAL EXCEPTION',
            ],
        });
    });

    it('creates a preview compatibility plan using semantic checks without screenshots', () => {
        const plan = buildAndroidNativeQaPlan({
            apkPath: '/repo/artifacts/agenthub-preview-arm64-latest.apk',
            packageName: 'com.artsum.agenthub.preview',
            deviceId: 'R5CW000000A',
            outputDir: '/repo/artifacts',
            timestamp: '20260705-0412',
            qaProfile: 'preview-visual',
        });

        expect(plan.qaProfile).toBe('preview-visual');
        expect(plan.screenshots).toEqual([]);
        expect(plan.commands.map((command) => command.label)).toEqual([
            'install apk',
            'clear app logcat',
            'launch app',
            'wait after launch',
            'verify launch foreground activity',
            'open alert QA deep link',
            'wait after alert route',
            'verify alert foreground activity',
            'verify alert content',
            'reset app after modal check',
            'open prompt QA deep link',
            'wait after prompt route',
            'verify prompt foreground activity',
            'verify prompt content',
            'tap prompt input',
            'enter prompt QA text',
            'reset app after prompt check',
            'open long content deep link',
            'wait after long content route',
            'verify long content foreground activity',
            'verify long content',
            'open lifecycle status deep link',
            'wait after lifecycle route',
            'verify lifecycle foreground activity',
            'verify lifecycle accessibility semantics',
            'collect logcat tail',
        ]);
        expect(plan.commands[0]).toMatchObject({
            executable: 'adb',
            args: ['-s', 'R5CW000000A', 'install', '-r', '/repo/artifacts/agenthub-preview-arm64-latest.apk'],
        });
        expect(plan.commands.some((command) => command.args.includes('screencap'))).toBe(false);
        expect(plan.commands.find((command) => command.label === 'open alert QA deep link')?.args).toEqual([
            '-s',
            'R5CW000000A',
            'shell',
            'am',
            'start',
            '-n',
            'com.artsum.agenthub.preview/.MainActivity',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            'agenthub://dev/modal-demo?agenthubNativeQa=alert',
        ]);
        expect(plan.commands.find((command) => command.label === 'reset app after modal check')?.args)
            .toEqual(['-s', 'R5CW000000A', 'shell', 'am', 'force-stop', 'com.artsum.agenthub.preview']);
        expect(plan.commands.find((command) => command.label === 'open prompt QA deep link')?.args).toEqual([
            '-s',
            'R5CW000000A',
            'shell',
            'am',
            'start',
            '-n',
            'com.artsum.agenthub.preview/.MainActivity',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            'agenthub://dev/modal-demo?agenthubNativeQa=prompt',
        ]);
        expect(plan.commands.find((command) => command.label === 'enter prompt QA text')?.args).toEqual([
            '-s',
            'R5CW000000A',
            'shell',
            'input',
            'text',
            'AgentHub%s1.0%snative%sprompt%sQA',
        ]);
        expect(plan.commands.find((command) => command.label === 'reset app after prompt check')?.args)
            .toEqual(['-s', 'R5CW000000A', 'shell', 'am', 'force-stop', 'com.artsum.agenthub.preview']);

        const foregroundChecks = plan.commands.filter((command) => command.label.includes('foreground activity'));
        expect(foregroundChecks).toHaveLength(5);
        expect(foregroundChecks.every((command) => command.expectedStdoutIncludes?.includes('com.artsum.agenthub.preview/.MainActivity'))).toBe(true);
        expect(plan.commands.find((command) => command.label === 'verify alert content')?.expectedStdoutIncludes).toBe('Simple Alert');
        expect(plan.commands.find((command) => command.label === 'verify prompt content')?.expectedStdoutIncludes).toBe('Rename workspace');
        expect(plan.commands.find((command) => command.label === 'verify long content')?.expectedStdoutIncludes).toBe('Code Surfaces');
        expect(plan.commands.find((command) => command.label === 'verify lifecycle accessibility semantics')?.expectedStdoutIncludes).toBe('content-desc="Stop timed out"');
        expect(plan.commands.find((command) => command.label === 'verify alert content')?.args).toEqual([
            '-s',
            'R5CW000000A',
            'exec-out',
            'uiautomator',
            'dump',
            '/dev/tty',
        ]);
        expect(plan.commands.at(-1)).toMatchObject({
            allowFailure: false,
            forbiddenStdoutIncludes: [
                'ANR in com.artsum.agenthub.preview',
                'FATAL EXCEPTION',
            ],
        });
    });
});
