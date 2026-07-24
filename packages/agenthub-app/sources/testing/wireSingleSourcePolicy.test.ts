import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const source = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('Wire single-source protocol policy', () => {
    it('keeps MessageMeta schema owned by Wire and re-exported by consumers', () => {
        const wire = source('packages/agenthub-wire/src/messageMeta.ts');
        const app = source('packages/agenthub-app/sources/sync/typesMessageMeta.ts');
        const cli = source('packages/agenthub-cli/src/api/types.ts');

        expect(wire).toContain('export const MessageMetaSchema = z.object');
        expect(app).toContain("export { MessageMetaSchema } from '@artsum/agenthub-wire'");
        expect(app).not.toContain('z.object');
        expect(cli).toContain("import { MessageMetaSchema, type MessageMeta } from '@artsum/agenthub-wire'");
        expect(cli).not.toContain('export const MessageMetaSchema = z.object');
    });

    it('keeps the session envelope owned by Wire across App, CLI and Agent', () => {
        const wire = source('packages/agenthub-wire/src/sessionProtocol.ts');
        const app = source('packages/agenthub-app/sources/sync/typesRaw.ts');
        const cli = source('packages/agenthub-cli/src/sessionProtocol/types.ts');
        const agent = source('packages/agenthub-agent/src/api.ts');

        expect(wire).toContain('export const sessionEnvelopeSchema =');
        expect(app).toContain("import { sessionEnvelopeSchema, type SessionEnvelope } from '@artsum/agenthub-wire'");
        expect(app).not.toContain('const sessionEnvelopeSchema =');
        expect(cli).toContain("export * from '@artsum/agenthub-wire'");
        expect(agent).toContain("SessionMessage as WireSessionMessage");
        expect(agent).toContain('export type RawMessage = WireSessionMessage');
    });
});
