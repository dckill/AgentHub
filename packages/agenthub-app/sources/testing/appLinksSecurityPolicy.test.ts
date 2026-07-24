import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '../..');

function readJson(relativePath: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

describe('App Links association security policy', () => {
    it('does not delegate AgentHub HTTPS routes to upstream Android applications', () => {
        const assetLinks = readJson('public/.well-known/assetlinks.json');
        expect(assetLinks).toEqual([]);
        expect(JSON.stringify(assetLinks)).not.toMatch(/com\.slopus|com\.ex3ndr|happy/i);
    });

    it('does not delegate AgentHub HTTPS routes to upstream Apple applications', () => {
        const association = readJson('public/.well-known/apple-app-site-association') as {
            applinks?: { details?: unknown[] };
            activitycontinuation?: { apps?: unknown[] };
        };
        expect(association.applinks?.details).toEqual([]);
        expect(association.activitycontinuation?.apps).toEqual([]);
        expect(JSON.stringify(association)).not.toMatch(/466DQWDR8C|com\.ex3ndr|happy/i);
    });

    it('keeps native HTTPS handling disabled until signed association inputs are authoritative', () => {
        const config = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
        expect(config).toContain('associatedDomains: []');
        expect(config).toContain('intentFilters: []');
    });
});
