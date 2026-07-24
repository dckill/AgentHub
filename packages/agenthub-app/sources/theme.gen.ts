import { writeFileSync } from 'fs';
import { agentHubGlass, agentHubMotion, agentHubSpacing, agentHubTokens } from './theme/agenthubTheme';

type ThemeSnapshotMode = keyof typeof agentHubTokens;

export function createThemeSnapshot(mode: ThemeSnapshotMode) {
    return {
        designSystem: 'AgentHub Amber Crystal',
        mode,
        colors: agentHubTokens[mode],
        spacing: agentHubSpacing,
        glass: agentHubGlass,
        motion: agentHubMotion,
    };
}

export function generateTheme() {
    writeFileSync('./sources/theme.light.json', `${JSON.stringify(createThemeSnapshot('light'), null, 2)}\n`);
    writeFileSync('./sources/theme.dark.json', `${JSON.stringify(createThemeSnapshot('dark'), null, 2)}\n`);
}

if (require.main === module) {
    generateTheme();
}
