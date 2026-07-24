export type AndroidDeviceState = 'device' | 'unauthorized';

export type AndroidDevice = {
    id: string;
    state: AndroidDeviceState;
    details: string;
};

export type AndroidQaCommand = {
    label: string;
    executable: 'adb' | 'sleep';
    args: string[];
    outputPath?: string;
    allowFailure?: boolean;
    expectedStdoutIncludes?: string;
    forbiddenStdoutIncludes?: string[];
};

export type AndroidQaScreenshot = {
    name: 'launch' | 'modal' | 'prompt-keyboard' | 'long-content' | 'lifecycle';
    path: string;
};

export type AndroidNativeQaProfile = 'production-smoke' | 'preview-visual';

export type AndroidNativeQaPlanOptions = {
    apkPath: string;
    packageName: string;
    deviceId: string;
    outputDir: string;
    timestamp: string;
    qaProfile: AndroidNativeQaProfile;
};

export type AndroidNativeQaPlan = {
    qaProfile: AndroidNativeQaProfile;
    packageName: string;
    deviceId: string;
    apkPath: string;
    screenshots: AndroidQaScreenshot[];
    commands: AndroidQaCommand[];
};

const DEFAULT_PROMPT_QA_TEXT = 'AgentHub 1.0 native prompt QA';
const DEFAULT_PROMPT_INPUT = { x: 540, y: 520 };

export function parseAdbDevices(output: string): AndroidDevice[] {
    return output
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [id = '', state = '', ...detailParts] = line.split(/\s+/);
            return {
                id,
                state,
                details: detailParts.join(' '),
            };
        })
        .filter((device): device is AndroidDevice => device.state === 'device' || device.state === 'unauthorized');
}

export function getPreferredAndroidDevice(
    devices: AndroidDevice[],
    requestedDeviceId?: string,
    deviceAbis: ReadonlyMap<string, string> = new Map(),
) {
    if (requestedDeviceId) {
        return devices.find((device) => device.id === requestedDeviceId && device.state === 'device');
    }

    const arm64Device = devices.find((device) => device.state === 'device' && deviceAbis.get(device.id)?.includes('arm64-v8a'));
    if (arm64Device) {
        return arm64Device;
    }

    return devices.find((device) => device.state === 'device');
}

export function buildAndroidNativeQaPlan(options: AndroidNativeQaPlanOptions): AndroidNativeQaPlan {
    const screenshots: AndroidQaScreenshot[] = [];
    const adb = (...args: string[]): AndroidQaCommand => ({
        label: '',
        executable: 'adb',
        args: ['-s', options.deviceId, ...args],
    });
    const sleep = (seconds: number): AndroidQaCommand => ({
        label: '',
        executable: 'sleep',
        args: [String(seconds)],
    });
    const verifyForeground = (label: string): AndroidQaCommand => ({
        ...adb('shell', 'dumpsys', 'activity', 'activities'),
        label,
        expectedStdoutIncludes: `${options.packageName}/.MainActivity`,
    });
    const verifyContent = (label: string, expectedText: string): AndroidQaCommand => ({
        ...adb('exec-out', 'uiautomator', 'dump', '/dev/tty'),
        label,
        expectedStdoutIncludes: expectedText,
    });

    const commands: AndroidQaCommand[] = [
        {
            ...adb('install', '-r', options.apkPath),
            label: 'install apk',
        },
        {
            ...adb('logcat', '-c'),
            label: 'clear app logcat',
        },
        {
            ...adb('shell', 'monkey', '-p', options.packageName, '-c', 'android.intent.category.LAUNCHER', '1'),
            label: 'launch app',
        },
        {
            ...sleep(8),
            label: 'wait after launch',
        },
        verifyForeground('verify launch foreground activity'),
        ...(options.qaProfile === 'production-smoke'
            ? [verifyContent('verify production content', 'AgentHub')]
            : []),
    ];

    if (options.qaProfile === 'preview-visual') {
        commands.push(
        {
            ...adb('shell', 'am', 'start', '-n', `${options.packageName}/.MainActivity`, '-a', 'android.intent.action.VIEW', '-d', 'agenthub://dev/modal-demo?agenthubNativeQa=alert'),
            label: 'open alert QA deep link',
        },
        {
            ...sleep(5),
            label: 'wait after alert route',
        },
        verifyForeground('verify alert foreground activity'),
        verifyContent('verify alert content', 'Simple Alert'),
        {
            ...adb('shell', 'am', 'force-stop', options.packageName),
            label: 'reset app after modal check',
        },
        {
            ...adb('shell', 'am', 'start', '-n', `${options.packageName}/.MainActivity`, '-a', 'android.intent.action.VIEW', '-d', 'agenthub://dev/modal-demo?agenthubNativeQa=prompt'),
            label: 'open prompt QA deep link',
        },
        {
            ...sleep(3),
            label: 'wait after prompt route',
        },
        verifyForeground('verify prompt foreground activity'),
        verifyContent('verify prompt content', 'Rename workspace'),
        {
            ...adb('shell', 'input', 'tap', String(DEFAULT_PROMPT_INPUT.x), String(DEFAULT_PROMPT_INPUT.y)),
            label: 'tap prompt input',
            allowFailure: true,
        },
        {
            ...adb('shell', 'input', 'text', encodeAdbInputText(DEFAULT_PROMPT_QA_TEXT)),
            label: 'enter prompt QA text',
            allowFailure: true,
        },
        {
            ...adb('shell', 'am', 'force-stop', options.packageName),
            label: 'reset app after prompt check',
            allowFailure: true,
        },
        {
            ...adb('shell', 'am', 'start', '-n', `${options.packageName}/.MainActivity`, '-a', 'android.intent.action.VIEW', '-d', 'agenthub://dev/code-surfaces'),
            label: 'open long content deep link',
            allowFailure: true,
        },
        {
            ...sleep(5),
            label: 'wait after long content route',
        },
        verifyForeground('verify long content foreground activity'),
        verifyContent('verify long content', 'Code Surfaces'),
        {
            ...adb('shell', 'am', 'start', '-n', `${options.packageName}/.MainActivity`, '-a', 'android.intent.action.VIEW', '-d', 'agenthub://dev/lifecycle-status'),
            label: 'open lifecycle status deep link',
        },
        {
            ...sleep(5),
            label: 'wait after lifecycle route',
        },
        verifyForeground('verify lifecycle foreground activity'),
        {
            ...adb('exec-out', 'uiautomator', 'dump', '/dev/tty'),
            label: 'verify lifecycle accessibility semantics',
            expectedStdoutIncludes: 'content-desc="Stop timed out"',
        },
        );
    }

    commands.push(
        {
            ...adb('logcat', '-d', '-t', '300'),
            label: 'collect logcat tail',
            outputPath: `${options.outputDir}/agenthub-v02-android-logcat-${options.timestamp}.txt`,
            allowFailure: false,
            forbiddenStdoutIncludes: [
                `ANR in ${options.packageName}`,
                'FATAL EXCEPTION',
            ],
        },
    );

    return {
        qaProfile: options.qaProfile,
        packageName: options.packageName,
        deviceId: options.deviceId,
        apkPath: options.apkPath,
        screenshots,
        commands,
    };
}

function encodeAdbInputText(text: string) {
    return text.replace(/ /g, '%s');
}
