import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNativeQaEvidence, formatNativeQaEvidenceMarkdown } from './nativeQaEvidence';

const repoRoot = process.cwd();
const artifactsDir = process.env.AGENTHUB_NATIVE_QA_ARTIFACTS_DIR || join(repoRoot, 'artifacts');
const allowPartial = process.argv.includes('--allow-partial');
const result = auditNativeQaEvidence({ artifactsDir, repoRoot });
const reportPath = join(artifactsDir, 'agenthub-v02-native-qa-evidence-latest.json');
const markdownPath = join(artifactsDir, 'agenthub-v02-native-qa-evidence-latest.md');
const output = { ...result, reportPath, markdownPath };

mkdirSync(artifactsDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(markdownPath, formatNativeQaEvidenceMarkdown(output));
console.log(JSON.stringify(output, null, 2));

process.exit(result.status === 'completed' ? 0 : result.status === 'partial' && allowPartial ? 0 : result.status === 'partial' ? 2 : 1);
