import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    IOS_SECURITY_QA_CASE_IDS,
    readIosSecurityQaEvidence,
} from './iosSecurityQaEvidence';

function makeArtifactsDir() {
    return mkdtempSync(join(tmpdir(), 'agenthub-ios-security-qa-'));
}

function writeCompleteEvidence(artifactsDir: string) {
    const evidenceDir = join(artifactsDir, 'ios-security');
    mkdirSync(evidenceDir);
    const cases = IOS_SECURITY_QA_CASE_IDS.map((id) => {
        const artifactPath = join(evidenceDir, `${id}.json`);
        writeFileSync(artifactPath, `${JSON.stringify({ id, passed: true })}\n`);
        return {
            id,
            status: 'passed',
            artifactPaths: [artifactPath],
            details: `${id} passed on the booted simulator`,
        };
    });
    const evidencePath = join(artifactsDir, 'agenthub-ios-security-qa-latest.json');
    writeFileSync(evidencePath, `${JSON.stringify({
        schemaVersion: 1,
        platform: 'ios',
        simulator: {
            name: 'iPhone 16 Pro',
            udid: '11111111-2222-3333-4444-555555555555',
            runtime: 'iOS 18.5',
        },
        cases,
    }, null, 2)}\n`);
    return { evidencePath, cases };
}

describe('AgentHub iOS security QA evidence', () => {
    it('accepts only a complete per-case evidence set whose artifacts exist under artifacts', () => {
        const artifactsDir = makeArtifactsDir();
        const { evidencePath } = writeCompleteEvidence(artifactsDir);

        const result = readIosSecurityQaEvidence({ evidencePath, artifactsDir });

        expect(result).toMatchObject({
            status: 'completed',
            evidencePath,
        });
        if (result.status === 'completed') {
            expect(result.evidence.cases.map((entry) => entry.id)).toEqual(IOS_SECURITY_QA_CASE_IDS);
        }
    });

    it('blocks when the evidence file is missing instead of treating visual smoke as completion', () => {
        const artifactsDir = makeArtifactsDir();
        const evidencePath = join(artifactsDir, 'agenthub-ios-security-qa-latest.json');

        expect(readIosSecurityQaEvidence({ evidencePath, artifactsDir })).toEqual({
            status: 'blocked',
            reason: 'iOS security QA evidence is missing',
            evidencePath,
        });
    });

    it('fails closed when a required case is missing or not passed', () => {
        const artifactsDir = makeArtifactsDir();
        const { evidencePath, cases } = writeCompleteEvidence(artifactsDir);
        writeFileSync(evidencePath, JSON.stringify({
            schemaVersion: 1,
            platform: 'ios',
            simulator: {
                name: 'iPhone 16 Pro',
                udid: '11111111-2222-3333-4444-555555555555',
                runtime: 'iOS 18.5',
            },
            cases: cases.slice(1).map((entry, index) => index === 0 ? { ...entry, status: 'failed' } : entry),
        }));

        const result = readIosSecurityQaEvidence({ evidencePath, artifactsDir });

        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.reason).toContain('missing required case: account-isolation');
            expect(result.reason).toContain('case delayed-response-abort has status failed');
        }
    });

    it('rejects duplicate cases and artifact paths outside the active artifacts directory', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = makeArtifactsDir();
        const { evidencePath, cases } = writeCompleteEvidence(artifactsDir);
        const outsideArtifact = join(outsideDir, 'outside.json');
        writeFileSync(outsideArtifact, '{}\n');
        writeFileSync(evidencePath, JSON.stringify({
            schemaVersion: 1,
            platform: 'ios',
            simulator: {
                name: 'iPhone 16 Pro',
                udid: '11111111-2222-3333-4444-555555555555',
                runtime: 'iOS 18.5',
            },
            cases: [
                { ...cases[0], artifactPaths: [outsideArtifact] },
                cases[0],
                ...cases.slice(1),
            ],
        }));

        const result = readIosSecurityQaEvidence({ evidencePath, artifactsDir });

        expect(result.status).toBe('failed');
        if (result.status === 'failed') {
            expect(result.reason).toContain('duplicate case: account-isolation');
            expect(result.reason).toContain('artifact is outside artifacts');
        }
    });
});
