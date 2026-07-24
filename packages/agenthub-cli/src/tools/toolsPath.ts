import { isAbsolute, resolve } from 'node:path';

import { projectPath } from '@/projectPath';

export const INTERNAL_TOOLS_DIR_ENV = 'AGENTHUB_INTERNAL_TOOLS_DIR';

export function resolveBundledToolsDir(): string {
    const prepared = process.env[INTERNAL_TOOLS_DIR_ENV];
    if (prepared && isAbsolute(prepared)) {
        return resolve(prepared);
    }
    return resolve(projectPath(), 'tools', 'unpacked');
}
