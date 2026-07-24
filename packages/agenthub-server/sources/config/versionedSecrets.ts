export interface VersionedSecrets {
    activeVersion: number;
    keys: Map<number, string>;
}

function positiveVersion(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readVersionedSecrets(options: {
    keysEnv: string;
    activeVersionEnv: string;
    fallbackSecret?: string;
    fallbackVersion?: number;
}): VersionedSecrets {
    const activeVersion = positiveVersion(process.env[options.activeVersionEnv], options.fallbackVersion ?? 1);
    const configured = process.env[options.keysEnv];
    if (!configured) {
        if (!options.fallbackSecret) throw new Error(`Missing required environment variable: ${options.keysEnv}`);
        return { activeVersion, keys: new Map([[activeVersion, options.fallbackSecret]]) };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(configured);
    } catch {
        throw new Error(`${options.keysEnv} must be a JSON object mapping positive key versions to secrets`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${options.keysEnv} must be a JSON object mapping positive key versions to secrets`);
    }

    const keys = new Map<number, string>();
    for (const [version, secret] of Object.entries(parsed)) {
        const numericVersion = Number(version);
        if (!Number.isSafeInteger(numericVersion) || numericVersion <= 0 || typeof secret !== 'string' || secret.length === 0) {
            throw new Error(`${options.keysEnv} contains an invalid key version or secret`);
        }
        keys.set(numericVersion, secret);
    }
    if (!keys.has(activeVersion)) {
        throw new Error(`${options.keysEnv} does not contain active key version ${activeVersion}`);
    }
    return { activeVersion, keys };
}
