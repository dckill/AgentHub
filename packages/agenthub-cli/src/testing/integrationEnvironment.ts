import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const ENVIRONMENTS_MODULE_URL = pathToFileURL(join(REPO_ROOT, 'environments', 'environments.ts')).href;

export type EnvironmentTemplate = 'authenticated-empty' | 'empty';

export type IntegrationEnvironment = {
    name: string;
    envDir: string;
    projectPath: string;
    serverPort: number;
    expoPort: number;
};

type EnvironmentConfig = {
    projectPath: string;
    serverPort: number;
    expoPort: number;
};

export function shouldStartIntegrationWeb(options?: { web?: boolean }): boolean {
    return options?.web !== false;
}

type EnvironmentsModule = {
    buildPrivateCliBundle: (envDir: string) => string;
    createEnvironment: (opts?: { noSwitch?: boolean }) => Promise<string>;
    getEnvironmentConfig: (name: string) => EnvironmentConfig;
    getEnvironmentDir: (name: string) => string;
    removeEnvironment: (name: string) => void;
    seedEnvironment: (name: string) => Promise<void>;
    setEnvironmentTemplate: (name: string, template: EnvironmentTemplate) => void;
    startEnvironmentServices: (name: string, options?: { web?: boolean }) => Promise<void>;
    stopEnvironment: (name: string) => void;
};

const environmentDestroyers = new Map<string, () => void>();

function createEnvironmentDestroyer(environments: EnvironmentsModule, name: string): () => void {
    let destroyed = false;
    return () => {
        if (destroyed) return;
        destroyed = true;
        environmentDestroyers.delete(name);

        const failures: unknown[] = [];
        try {
            environments.stopEnvironment(name);
        } catch (error) {
            failures.push(error);
        }

        try {
            environments.removeEnvironment(name);
        } catch (error) {
            failures.push(error);
        }

        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) {
            throw new AggregateError(failures, `Failed to fully destroy integration environment ${name}`);
        }
    };
}

async function loadEnvironmentManager(): Promise<EnvironmentsModule> {
    return await import(ENVIRONMENTS_MODULE_URL) as EnvironmentsModule;
}

export async function createIntegrationEnvironment(options?: { template?: EnvironmentTemplate; up?: boolean; web?: boolean }): Promise<IntegrationEnvironment> {
    const template = options?.template ?? 'authenticated-empty';
    const shouldStart = options?.up ?? true;
    const environments = await loadEnvironmentManager();
    const name = await environments.createEnvironment({ noSwitch: true });
    const destroy = createEnvironmentDestroyer(environments, name);
    environmentDestroyers.set(name, destroy);

    try {
        environments.setEnvironmentTemplate(name, template);

        if (shouldStart) {
            await environments.startEnvironmentServices(name, { web: shouldStartIntegrationWeb(options) });
            if (template === 'authenticated-empty') {
                environments.buildPrivateCliBundle(environments.getEnvironmentDir(name));
                await environments.seedEnvironment(name);
            }
        }

        const config = environments.getEnvironmentConfig(name);
        return {
            name,
            envDir: environments.getEnvironmentDir(name),
            projectPath: config.projectPath,
            serverPort: config.serverPort,
            expoPort: config.expoPort,
        };
    } catch (error) {
        try {
            destroy();
        } catch {}

        throw error;
    }
}

export function applyEnvironmentToProcess(env: IntegrationEnvironment) {
    process.env.AGENTHUB_SERVER_URL = `http://localhost:${env.serverPort}`;
    process.env.AGENTHUB_HOME_DIR = join(env.envDir, 'cli', 'home');
    process.env.AGENTHUB_CLI_ROOT = join(env.envDir, 'cli', 'bundle');
    process.env.AGENTHUB_PROJECT_DIR = env.projectPath;
    process.env.AGENTHUB_VARIANT = 'dev';
    process.env.DEBUG = '1';
}

export async function destroyIntegrationEnvironment(env: IntegrationEnvironment) {
    const destroy = environmentDestroyers.get(env.name);
    if (destroy) {
        destroy();
        return;
    }

    const environments = await loadEnvironmentManager();
    createEnvironmentDestroyer(environments, env.name)();
}

export async function destroyIntegrationEnvironmentByName(name: string) {
    const environments = await loadEnvironmentManager();
    if (!existsSync(environments.getEnvironmentDir(name))) return;
    createEnvironmentDestroyer(environments, name)();
}
