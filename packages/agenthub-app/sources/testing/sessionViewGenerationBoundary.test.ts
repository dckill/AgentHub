import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('session view generation boundary', () => {
    it('guards control claim/release and compact message side effects by account generation', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', '-session/SessionView.tsx'),
            'utf8',
        );

        expect(source).toMatch(/onControlClaim=\{async \(\) => \{[\s\S]*?const generation = sync\.getAccountGeneration\(\);[\s\S]*?if \(!isCurrent\(\)\) return;[\s\S]*?claimSessionControl\(sessionId\)[\s\S]*?if \(!isCurrent\(\)\) return;/);
        expect(source).toMatch(/onControlRelease=\{async \(\) => \{[\s\S]*?const generation = sync\.getAccountGeneration\(\);[\s\S]*?if \(!isCurrent\(\)\) return;[\s\S]*?releaseSessionControl\(sessionId\)[\s\S]*?if \(!isCurrent\(\)\) return;/);
        expect(source).toMatch(/onCompactPress=\{async \(\) => \{[\s\S]*?const generation = sync\.getAccountGeneration\(\);[\s\S]*?if \(!isCurrent\(\)\) return;[\s\S]*?sync\.sendMessage\(sessionId, '\/compact'/);
    });
});
