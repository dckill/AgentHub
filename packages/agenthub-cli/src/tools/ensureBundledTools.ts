import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { projectPath } from '@/projectPath';
import { INTERNAL_TOOLS_DIR_ENV } from './toolsPath';

type UnpackResult = {
    success: true;
    alreadyUnpacked: boolean;
    unpackedPath: string;
};

type UnpackModule = {
    unpackTools(options?: { silent?: boolean }): Promise<UnpackResult>;
};

export async function ensureBundledTools(): Promise<string> {
    const cliRoot = projectPath();
    const requireFromCli = createRequire(resolve(cliRoot, 'dist', 'index.mjs'));
    const { unpackTools } = requireFromCli(resolve(cliRoot, 'scripts', 'unpack-tools.cjs')) as UnpackModule;
    const result = await unpackTools({ silent: true });
    process.env[INTERNAL_TOOLS_DIR_ENV] = result.unpackedPath;
    return result.unpackedPath;
}
