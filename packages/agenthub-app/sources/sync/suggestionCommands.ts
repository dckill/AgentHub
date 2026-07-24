/**
 * Suggestion commands functionality for slash commands
 * Reads commands directly from session metadata storage
 */

import { storage } from './storage';
import { t } from '@/text';
import {
    buildCommandsForSessionMetadata,
    IGNORED_COMMANDS,
    type CommandItem,
} from './suggestionCommandRules';

export type { CommandItem } from './suggestionCommandRules';
export { buildCommandsForSessionMetadata, IGNORED_COMMANDS } from './suggestionCommandRules';

interface SearchOptions {
    limit?: number;
    threshold?: number;
    hideCompact?: boolean;
}

// Command descriptions for known tools/commands
const KNOWN_COMMAND_DESCRIPTION_KEYS = {
    compact: 'slashCommands.compact',
    clear: 'slashCommands.clear',
    goal: 'slashCommands.goal',
    mcp: 'slashCommands.mcp',
    skills: 'slashCommands.skills',
    reset: 'slashCommands.reset',
    debug: 'slashCommands.debug',
    status: 'slashCommands.status',
    stop: 'slashCommands.stop',
    abort: 'slashCommands.abort',
    cancel: 'slashCommands.cancel',
    export: 'slashCommands.export',
} as const;

function getCommandDescription(cmd: string): string | undefined {
    if (cmd.startsWith('skill:')) {
        return getSkillDescription(cmd.slice('skill:'.length));
    }

    const knownKey = KNOWN_COMMAND_DESCRIPTION_KEYS[cmd as keyof typeof KNOWN_COMMAND_DESCRIPTION_KEYS];
    if (knownKey) {
        return t(knownKey);
    }
    return t('slashCommands.runCommand', { command: cmd });
}

function getSkillDescription(skill: string): string {
    const normalized = skill.toLowerCase();

    if (normalized.includes('frontend') || normalized.includes('ui') || normalized.includes('design')) {
        return t('slashCommands.skillFrontend');
    }
    if (normalized.includes('debug')) {
        return t('slashCommands.skillDebug');
    }
    if (normalized.includes('plan')) {
        return t('slashCommands.skillPlan');
    }
    if (normalized.includes('review')) {
        return t('slashCommands.skillReview');
    }
    if (normalized.includes('test')) {
        return t('slashCommands.skillTest');
    }
    if (normalized.includes('git')) {
        return t('slashCommands.skillGit');
    }
    return t('slashCommands.skillGeneric');
}

// Get commands from session metadata
// Get commands from session metadata
function getCommandsFromSession(sessionId: string, options: { hideCompact?: boolean } = {}): CommandItem[] {
    const state = storage.getState();
    const session = state.sessions[sessionId];
    return buildCommandsForSessionMetadata(
        session?.metadata,
        {
            compact: t('slashCommands.compact'),
            clear: t('slashCommands.clear'),
            goal: t('slashCommands.goal'),
            mcp: t('slashCommands.mcp'),
            skills: t('slashCommands.skills'),
        },
        getCommandDescription,
        {
            hideCompact: options.hideCompact,
            getSkillInsertText: (skill) => t('slashCommands.useSkill', { skill }),
        },
    );
}

// Main export: search commands with fuzzy matching
export async function searchCommands(
    sessionId: string,
    query: string,
    options: SearchOptions = {}
): Promise<CommandItem[]> {
    const { limit = 10, threshold = 0.3, hideCompact = false } = options;
    
    // Get commands from session metadata (no caching)
    const commands = getCommandsFromSession(sessionId, { hideCompact });
    
    // If query is empty, return all commands
    if (!query || query.trim().length === 0) {
        return commands.slice(0, limit);
    }

    const { default: Fuse } = await import('fuse.js');
    
    // Setup Fuse for fuzzy search
    const fuseOptions = {
        keys: [
            { name: 'command', weight: 0.7 },
            { name: 'description', weight: 0.3 }
        ],
        threshold,
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 1,
        ignoreLocation: true,
        useExtendedSearch: true
    };
    
    const fuse = new Fuse(commands, fuseOptions);
    const results = fuse.search(query, { limit });
    
    return results.map(result => result.item);
}

// Get all available commands for a session
export function getAllCommands(sessionId: string, options: { hideCompact?: boolean } = {}): CommandItem[] {
    return getCommandsFromSession(sessionId, options);
}
