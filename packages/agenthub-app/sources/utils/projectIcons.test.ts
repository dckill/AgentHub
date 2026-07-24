import { describe, expect, it } from 'vitest';

import ioniconsGlyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
import {
    PROJECT_ICON_CHOICES,
    buildProjectKey,
    getDefaultProjectIcon,
    getProjectIconDefinition,
} from './projectIcons';

describe('projectIcons', () => {
    it('exposes the full professional vector project icon set', () => {
        expect(PROJECT_ICON_CHOICES).toHaveLength(120);
        expect(PROJECT_ICON_CHOICES.every((icon) => icon.id.startsWith('icon:'))).toBe(true);

        const iconIds = PROJECT_ICON_CHOICES.map((icon) => icon.id);
        expect(new Set(iconIds)).toHaveLength(iconIds.length);
        expect(PROJECT_ICON_CHOICES.every((icon) => icon.icon in ioniconsGlyphMap)).toBe(true);
    });

    it('falls back to a vector icon for unknown customizations', () => {
        expect(getProjectIconDefinition('icon:terminal').id).toBe('icon:terminal');
        expect(getProjectIconDefinition('not-a-project-icon').id).toBe(PROJECT_ICON_CHOICES[0].id);
    });

    it('assigns a vector icon by default', () => {
        const icon = getProjectIconDefinition(getDefaultProjectIcon('/workspace/app'));
        expect(icon.id.startsWith('icon:')).toBe(true);
    });

    it('normalizes project keys so equivalent paths stay grouped', () => {
        expect(buildProjectKey('machine-1', '/workspace/app/')).toBe('machine-1:/workspace/app');
        expect(buildProjectKey('machine-1', '/workspace//app')).toBe('machine-1:/workspace/app');
    });
});
