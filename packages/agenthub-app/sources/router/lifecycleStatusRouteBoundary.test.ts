import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('lifecycle status native QA route', () => {
    it('owns its header boundary so the real chat header is not duplicated', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../app/(app)/dev/lifecycle-status.tsx'),
            'utf8',
        );

        expect(source).toContain("import { Stack } from 'expo-router'");
        expect(source).toContain('<Stack.Screen options={{ headerShown: false }} />');
    });
});
