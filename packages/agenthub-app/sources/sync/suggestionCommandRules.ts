export interface CommandItem {
    command: string;
    description?: string;
    label?: string;
    insertText?: string;
    category?: 'common' | 'builtin' | 'extension';
}

export type CommandDescriptions = Partial<Record<'compact' | 'clear' | 'goal' | 'mcp' | 'skills', string>>;
export interface BuildCommandOptions {
    hideCompact?: boolean;
    getSkillInsertText?: (skill: string) => string;
}

// Commands that are either navigational, account-level, or unavailable from the mobile chat composer.
export const IGNORED_COMMANDS = [
    'add-dir',
    'agents',
    'config',
    'statusline',
    'bashes',
    'settings',
    'cost',
    'doctor',
    'exit',
    'help',
    'ide',
    'init',
    'install-github-app',
    'memory',
    'migrate-installer',
    'model',
    'pr-comments',
    'release-notes',
    'resume',
    'status',
    'bug',
    'review',
    'security-review',
    'terminal-setup',
    'upgrade',
    'vim',
    'permissions',
    'hooks',
    'export',
    'logout',
    'login',
] as const;

function createClaudeDefaults(descriptions: CommandDescriptions): CommandItem[] {
    return [
        { command: 'compact', description: descriptions.compact, category: 'common' },
        { command: 'clear', description: descriptions.clear, category: 'common' },
        { command: 'goal', description: descriptions.goal, category: 'common' },
        { command: 'mcp', description: descriptions.mcp, category: 'builtin' },
        { command: 'skills', description: descriptions.skills, category: 'builtin' },
    ];
}

function createCodexDefaults(descriptions: CommandDescriptions): CommandItem[] {
    return [
        { command: 'compact', description: descriptions.compact, category: 'common' },
        { command: 'clear', description: descriptions.clear, category: 'common' },
        { command: 'goal', description: descriptions.goal, category: 'common' },
    ];
}

export function buildCommandsForSessionMetadata(
    metadata: {
        flavor?: string | null;
        slashCommands?: string[];
        skills?: string[];
    } | null | undefined,
    descriptions: CommandDescriptions = {},
    getCommandDescription?: (command: string) => string | undefined,
    options: BuildCommandOptions = {},
): CommandItem[] {
    const flavor = metadata?.flavor;
    const isCodex = flavor === 'codex' || flavor === 'gpt' || flavor === 'openai';
    const hasSkills = (metadata?.skills?.length ?? 0) > 0;
    let commands: CommandItem[] = [...(isCodex ? createCodexDefaults(descriptions) : createClaudeDefaults(descriptions))];
    if (options.hideCompact) {
        commands = commands.filter((command) => command.command !== 'compact');
    }

    if (metadata?.slashCommands) {
        for (const cmd of metadata.slashCommands) {
            if ((IGNORED_COMMANDS as readonly string[]).includes(cmd)) continue;
            if (options.hideCompact && cmd === 'compact') continue;
            if (cmd === 'skills' && hasSkills) continue;
            if (isCodex && cmd === 'mcp') continue;

            if (!commands.find(c => c.command === cmd)) {
                commands.push({
                    command: cmd,
                    description: getCommandDescription?.(cmd),
                    category: 'builtin',
                });
            }
        }
    }

    if (hasSkills) {
        const withoutGenericSkills = commands.filter((command) => command.command !== 'skills');
        for (const skill of metadata?.skills ?? []) {
            withoutGenericSkills.push({
                command: `skill:${skill}`,
                label: skill,
                description: getCommandDescription?.(`skill:${skill}`),
                category: 'extension',
                insertText: options.getSkillInsertText?.(skill) ?? `Use the ${skill} skill: `,
            });
        }
        return withoutGenericSkills;
    }

    return commands;
}
