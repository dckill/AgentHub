import { createAgentHubRuntimeTheme } from './theme/agenthubTheme';

export const lightTheme = createAgentHubRuntimeTheme('light');
export const darkTheme = createAgentHubRuntimeTheme('dark');

export type Theme = typeof lightTheme;
