import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

export const IOS_SECURITY_QA_CASE_IDS = [
    'account-isolation',
    'delayed-response-abort',
    'offline-mermaid',
    'recovery-key-auth-cancel',
    'recovery-key-auth-success',
    'recovery-key-screen-capture',
    'recovery-key-background-hide',
    'recovery-key-clipboard-ttl',
] as const;

export type IosSecurityQaCaseId = typeof IOS_SECURITY_QA_CASE_IDS[number];

type IosSecurityQaCaseEvidence = {
    id: IosSecurityQaCaseId;
    status: 'passed';
    artifactPaths: string[];
    details: string;
};

export type IosSecurityQaEvidence = {
    schemaVersion: 1;
    platform: 'ios';
    simulator: {
        name: string;
        udid: string;
        runtime: string;
    };
    cases: IosSecurityQaCaseEvidence[];
};

type ReadIosSecurityQaEvidenceOptions = {
    evidencePath: string;
    artifactsDir: string;
    expectedDeviceId?: string;
};

export type IosSecurityQaEvidenceResult =
    | {
          status: 'completed';
          evidencePath: string;
          evidence: IosSecurityQaEvidence;
      }
    | {
          status: 'blocked';
          reason: string;
          evidencePath: string;
      }
    | {
          status: 'failed';
          reason: string;
          evidencePath: string;
      };

function isNonEmptyFile(path: string) {
    try {
        const stats = statSync(path);
        return stats.isFile() && stats.size > 0;
    } catch {
        return false;
    }
}

function isPathInsideDirectory(path: string, directory: string) {
    if (!isAbsolute(path)) {
        return false;
    }
    const relativePath = relative(directory, path);
    if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
        return false;
    }
    try {
        const realDirectory = realpathSync(directory);
        const realPath = realpathSync(path);
        const realRelativePath = relative(realDirectory, realPath);
        return realRelativePath !== '' && !realRelativePath.startsWith('..') && !isAbsolute(realRelativePath);
    } catch {
        return false;
    }
}

export function readIosSecurityQaEvidence(
    options: ReadIosSecurityQaEvidenceOptions,
): IosSecurityQaEvidenceResult {
    if (!existsSync(options.evidencePath)) {
        return {
            status: 'blocked',
            reason: 'iOS security QA evidence is missing',
            evidencePath: options.evidencePath,
        };
    }
    if (!isPathInsideDirectory(options.evidencePath, options.artifactsDir)) {
        return {
            status: 'failed',
            reason: 'iOS security QA evidence file is outside artifacts',
            evidencePath: options.evidencePath,
        };
    }

    let input: unknown;
    try {
        input = JSON.parse(readFileSync(options.evidencePath, 'utf8'));
    } catch (error) {
        return {
            status: 'failed',
            reason: `iOS security QA evidence is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            evidencePath: options.evidencePath,
        };
    }

    const errors: string[] = [];
    const report = input as Partial<IosSecurityQaEvidence>;
    if (report.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (report.platform !== 'ios') errors.push('platform must be ios');
    if (!report.simulator || typeof report.simulator !== 'object') {
        errors.push('simulator metadata is missing');
    } else {
        if (!report.simulator.name) errors.push('simulator name is missing');
        if (!report.simulator.udid) errors.push('simulator udid is missing');
        if (!report.simulator.runtime) errors.push('simulator runtime is missing');
        if (options.expectedDeviceId && report.simulator.udid !== options.expectedDeviceId) {
            errors.push(`simulator udid does not match booted device ${options.expectedDeviceId}`);
        }
    }

    const entries = Array.isArray(report.cases) ? report.cases : [];
    if (!Array.isArray(report.cases)) errors.push('cases must be an array');
    const seen = new Set<string>();
    for (const entry of entries as Array<Partial<IosSecurityQaCaseEvidence>>) {
        const id = typeof entry.id === 'string' ? entry.id : 'missing';
        if (seen.has(id)) errors.push(`duplicate case: ${id}`);
        seen.add(id);
        if (!IOS_SECURITY_QA_CASE_IDS.includes(id as IosSecurityQaCaseId)) {
            errors.push(`unknown case: ${id}`);
            continue;
        }
        if (entry.status !== 'passed') errors.push(`case ${id} has status ${String(entry.status)}`);
        if (typeof entry.details !== 'string' || entry.details.trim() === '') {
            errors.push(`case ${id} details are missing`);
        }
        if (!Array.isArray(entry.artifactPaths) || entry.artifactPaths.length === 0) {
            errors.push(`case ${id} has no artifacts`);
            continue;
        }
        for (const artifactPath of entry.artifactPaths) {
            if (typeof artifactPath !== 'string' || !isPathInsideDirectory(artifactPath, options.artifactsDir)) {
                errors.push(`case ${id} artifact is outside artifacts or missing: ${String(artifactPath)}`);
            } else if (!isNonEmptyFile(artifactPath)) {
                errors.push(`case ${id} artifact is empty: ${artifactPath}`);
            }
        }
    }
    for (const id of IOS_SECURITY_QA_CASE_IDS) {
        if (!seen.has(id)) errors.push(`missing required case: ${id}`);
    }

    if (errors.length > 0) {
        return {
            status: 'failed',
            reason: errors.join('; '),
            evidencePath: options.evidencePath,
        };
    }
    return {
        status: 'completed',
        evidencePath: options.evidencePath,
        evidence: report as IosSecurityQaEvidence,
    };
}
