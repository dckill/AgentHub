import { IOS_SECURITY_QA_CASE_IDS, type IosSecurityQaCaseId } from './iosSecurityQaEvidence';

export type IosSimulatorDevice = {
    name: string;
    udid: string;
    runtime: string;
};

export type IosQaCommand = {
    label: string;
    executable: 'xcrun' | 'sleep';
    args: string[];
    outputPath?: string;
    allowFailure?: boolean;
};

export type IosQaScreenshot = {
    name: 'launch' | 'modal' | 'prompt-keyboard' | 'long-content';
    path: string;
};

export type IosNativeQaPlanOptions = {
    appPath: string;
    bundleIdentifier: string;
    deviceId: string;
    outputDir: string;
    timestamp: string;
};

export type IosNativeQaPlan = {
    bundleIdentifier: string;
    deviceId: string;
    appPath: string;
    screenshots: IosQaScreenshot[];
    securityCases: readonly IosSecurityQaCaseId[];
    commands: IosQaCommand[];
};

export function parseXcrunSimctlBootedDevices(output: string): IosSimulatorDevice[] {
    const parsed = JSON.parse(output) as {
        devices?: Record<string, Array<{ name?: string; udid?: string; state?: string }>>;
    };
    return Object.entries(parsed.devices ?? {}).flatMap(([runtime, devices]) => {
        if (!runtime.includes('iOS')) {
            return [];
        }
        return devices
            .filter((device) => device.state === 'Booted' && device.name && device.udid)
            .map((device) => ({
                name: String(device.name),
                udid: String(device.udid),
                runtime,
            }));
    });
}

export function buildIosNativeQaPlan(options: IosNativeQaPlanOptions): IosNativeQaPlan {
    const screenshots: IosQaScreenshot[] = [];
    const xcrun = (...args: string[]): IosQaCommand => ({
        label: '',
        executable: 'xcrun',
        args,
    });
    const sleep = (seconds: number): IosQaCommand => ({
        label: '',
        executable: 'sleep',
        args: [String(seconds)],
    });

    const commands: IosQaCommand[] = [
        {
            ...xcrun('simctl', 'install', options.deviceId, options.appPath),
            label: 'install app',
        },
        {
            ...xcrun('simctl', 'launch', options.deviceId, options.bundleIdentifier),
            label: 'launch app',
        },
        {
            ...sleep(8),
            label: 'wait after launch',
        },
        {
            ...xcrun('simctl', 'spawn', options.deviceId, 'log', 'show', '--last', '2m', '--style', 'compact'),
            label: 'collect system log tail',
            outputPath: `${options.outputDir}/agenthub-v02-ios-log-${options.timestamp}.txt`,
            allowFailure: true,
        },
    ];

    return {
        bundleIdentifier: options.bundleIdentifier,
        deviceId: options.deviceId,
        appPath: options.appPath,
        screenshots,
        securityCases: IOS_SECURITY_QA_CASE_IDS,
        commands,
    };
}
