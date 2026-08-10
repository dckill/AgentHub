import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('mobile liquid glass experience boundary', () => {
    it('keeps native iOS, legacy iOS and Android material backends explicit', () => {
        const source = read('components/MobileGlass.tsx');
        const policy = read('components/mobileGlassPolicy.ts');
        expect(source).toContain('isGlassEffectAPIAvailable');
        expect(source).toContain("backend === 'native-liquid'");
        expect(source).toContain("backend === 'ios-blur'");
        expect(policy).toContain('android-simulated');
        expect(source).toContain('useReducedMotion');
    });

    it('applies the material to navigation chrome and the chat header', () => {
        expect(read('components/navigation/Header.tsx')).toContain('MobileGlassSurface');
        expect(read('components/ChatHeaderView.tsx')).toContain('MobileGlassSurface');
    });

    it('applies a readable frosted material to Android and iOS composer docks', () => {
        expect(read('components/AgentContentView.tsx')).toContain('material="frosted"');
        expect(read('components/AgentContentView.ios.tsx')).toContain('material="frosted"');
    });
});
