import { readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const { shouldUseProductionRouterContext } = require('./productionRouterBoundary.cjs') as {
    shouldUseProductionRouterContext: (appEnv: string | undefined) => boolean;
};

export { shouldUseProductionRouterContext };

export function getProductionRouteFiles(appRoot: string): string[] {
    const files: string[] = [];
    const visit = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const absolutePath = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'dev') visit(absolutePath);
            } else if (/\.[tj]sx?$/.test(entry.name) && !entry.name.includes('+api.')) {
                files.push(`./${relative(appRoot, absolutePath).split(sep).join('/')}`);
            }
        }
    };
    visit(appRoot);
    return files.sort();
}
