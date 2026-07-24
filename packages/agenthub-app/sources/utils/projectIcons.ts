/**
 * Project icon system.
 * Provides professional vector icon choices and deterministic auto-assignment.
 */

export type ProjectIconDefinition = {
    id: `icon:${string}`;
    icon: string;
    color: string;
    backgroundColor: string;
};

const PROFESSIONAL_PROJECT_ICONS: readonly ProjectIconDefinition[] = [
    { id: 'icon:terminal', icon: 'terminal-outline', color: '#38BDF8', backgroundColor: '#0F3A4A' },
    { id: 'icon:code', icon: 'code-slash-outline', color: '#A78BFA', backgroundColor: '#30224F' },
    { id: 'icon:git', icon: 'git-branch-outline', color: '#34D399', backgroundColor: '#153D31' },
    { id: 'icon:server', icon: 'server-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:cloud', icon: 'cloud-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:mobile', icon: 'phone-portrait-outline', color: '#F472B6', backgroundColor: '#4A1D3A' },
    { id: 'icon:web', icon: 'globe-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:package', icon: 'cube-outline', color: '#FDBA74', backgroundColor: '#4A2A16' },
    { id: 'icon:test', icon: 'flask-outline', color: '#BEF264', backgroundColor: '#334714' },
    { id: 'icon:docs', icon: 'document-text-outline', color: '#FDE68A', backgroundColor: '#4A3C17' },
    { id: 'icon:bug', icon: 'bug-outline', color: '#FB7185', backgroundColor: '#4A1D27' },
    { id: 'icon:rocket', icon: 'rocket-outline', color: '#F97316', backgroundColor: '#4A2814' },
    { id: 'icon:secure', icon: 'lock-closed-outline', color: '#67E8F9', backgroundColor: '#16424A' },
    { id: 'icon:analytics', icon: 'analytics-outline', color: '#C084FC', backgroundColor: '#3A2455' },
    { id: 'icon:automation', icon: 'flash-outline', color: '#FACC15', backgroundColor: '#4A3B12' },
    { id: 'icon:design', icon: 'brush-outline', color: '#FB923C', backgroundColor: '#4A2A1A' },
    { id: 'icon:settings', icon: 'settings-outline', color: '#CBD5E1', backgroundColor: '#293241' },
    { id: 'icon:network', icon: 'git-network-outline', color: '#5EEAD4', backgroundColor: '#163C37' },
    { id: 'icon:tools', icon: 'construct-outline', color: '#FBBF24', backgroundColor: '#463714' },
    { id: 'icon:layers', icon: 'layers-outline', color: '#818CF8', backgroundColor: '#252A55' },
    { id: 'icon:database', icon: 'server-outline', color: '#22C55E', backgroundColor: '#123B2A' },
    { id: 'icon:api', icon: 'swap-horizontal-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:cli', icon: 'caret-forward-circle-outline', color: '#A3E635', backgroundColor: '#2F3F14' },
    { id: 'icon:build', icon: 'hammer-outline', color: '#F59E0B', backgroundColor: '#463214' },
    { id: 'icon:deploy', icon: 'cloud-upload-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:monitor', icon: 'pulse-outline', color: '#FB7185', backgroundColor: '#4A1D27' },
    { id: 'icon:logs', icon: 'receipt-outline', color: '#FDE68A', backgroundColor: '#453B17' },
    { id: 'icon:config', icon: 'options-outline', color: '#CBD5E1', backgroundColor: '#293241' },
    { id: 'icon:auth', icon: 'key-outline', color: '#FACC15', backgroundColor: '#453912' },
    { id: 'icon:cache', icon: 'file-tray-stacked-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:queue', icon: 'list-circle-outline', color: '#C084FC', backgroundColor: '#3A2455' },
    { id: 'icon:workflow', icon: 'git-compare-outline', color: '#5EEAD4', backgroundColor: '#163C37' },
    { id: 'icon:robotics', icon: 'hardware-chip-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:ai', icon: 'sparkles-outline', color: '#F0ABFC', backgroundColor: '#4A1F4F' },
    { id: 'icon:research', icon: 'search-outline', color: '#67E8F9', backgroundColor: '#16424A' },
    { id: 'icon:notebook', icon: 'journal-outline', color: '#FDE68A', backgroundColor: '#4A3C17' },
    { id: 'icon:review', icon: 'checkmark-done-outline', color: '#86EFAC', backgroundColor: '#173F2A' },
    { id: 'icon:quality', icon: 'shield-checkmark-outline', color: '#34D399', backgroundColor: '#153D31' },
    { id: 'icon:performance', icon: 'speedometer-outline', color: '#F97316', backgroundColor: '#4A2814' },
    { id: 'icon:mobile-build', icon: 'phone-landscape-outline', color: '#F472B6', backgroundColor: '#4A1D3A' },
    { id: 'icon:desktop', icon: 'desktop-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:browser', icon: 'browsers-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:package-release', icon: 'archive-outline', color: '#FDBA74', backgroundColor: '#4A2A16' },
    { id: 'icon:branch', icon: 'git-pull-request-outline', color: '#34D399', backgroundColor: '#153D31' },
    { id: 'icon:merge', icon: 'git-merge-outline', color: '#86EFAC', backgroundColor: '#173F2A' },
    { id: 'icon:cloud-sync', icon: 'sync-circle-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:terminal-grid', icon: 'grid-outline', color: '#A78BFA', backgroundColor: '#30224F' },
    { id: 'icon:forms', icon: 'clipboard-outline', color: '#FDE68A', backgroundColor: '#4A3C17' },
    { id: 'icon:chart', icon: 'bar-chart-outline', color: '#C084FC', backgroundColor: '#3A2455' },
    { id: 'icon:timeline', icon: 'time-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:plugin', icon: 'extension-puzzle-outline', color: '#FBBF24', backgroundColor: '#463714' },
    { id: 'icon:environment', icon: 'leaf-outline', color: '#BEF264', backgroundColor: '#334714' },
    { id: 'icon:release', icon: 'paper-plane-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:container', icon: 'layers-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:security-scan', icon: 'scan-outline', color: '#67E8F9', backgroundColor: '#16424A' },
    { id: 'icon:lint', icon: 'checkmark-circle-outline', color: '#86EFAC', backgroundColor: '#173F2A' },
    { id: 'icon:build-log', icon: 'reader-outline', color: '#FDE68A', backgroundColor: '#453B17' },
    { id: 'icon:dependency', icon: 'git-compare-outline', color: '#A78BFA', backgroundColor: '#30224F' },
    { id: 'icon:database-migration', icon: 'repeat-outline', color: '#22C55E', backgroundColor: '#123B2A' },
    { id: 'icon:storage', icon: 'file-tray-full-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:secrets', icon: 'keypad-outline', color: '#FACC15', backgroundColor: '#453912' },
    { id: 'icon:observability', icon: 'stats-chart-outline', color: '#FB7185', backgroundColor: '#4A1D27' },
    { id: 'icon:scheduler', icon: 'calendar-outline', color: '#FBBF24', backgroundColor: '#463714' },
    { id: 'icon:worker', icon: 'cog-outline', color: '#CBD5E1', backgroundColor: '#293241' },
    { id: 'icon:gateway', icon: 'swap-vertical-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:frontend', icon: 'color-palette-outline', color: '#FB923C', backgroundColor: '#4A2A1A' },
    { id: 'icon:backend', icon: 'server-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:mobile-test', icon: 'phone-portrait-outline', color: '#F472B6', backgroundColor: '#4A1D3A' },
    { id: 'icon:desktop-app', icon: 'laptop-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:documentation', icon: 'book-outline', color: '#FDE68A', backgroundColor: '#4A3C17' },
    { id: 'icon:prompt', icon: 'chatbox-ellipses-outline', color: '#C084FC', backgroundColor: '#3A2455' },
    { id: 'icon:model', icon: 'radio-outline', color: '#F0ABFC', backgroundColor: '#4A1F4F' },
    { id: 'icon:dataset', icon: 'albums-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:search-index', icon: 'filter-outline', color: '#67E8F9', backgroundColor: '#16424A' },
    { id: 'icon:release-notes', icon: 'megaphone-outline', color: '#FDBA74', backgroundColor: '#4A2A16' },
    { id: 'icon:hotfix', icon: 'medical-outline', color: '#FB7185', backgroundColor: '#4A1D27' },
    { id: 'icon:refactor', icon: 'shuffle-outline', color: '#A78BFA', backgroundColor: '#30224F' },
    { id: 'icon:experiment', icon: 'beaker-outline', color: '#BEF264', backgroundColor: '#334714' },
    { id: 'icon:accessibility', icon: 'accessibility-outline', color: '#86EFAC', backgroundColor: '#173F2A' },
    { id: 'icon:backup', icon: 'cloud-done-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:planning', icon: 'calendar-number-outline', color: '#FBBF24', backgroundColor: '#463714' },
    { id: 'icon:roadmap', icon: 'map-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:milestone', icon: 'flag-outline', color: '#F97316', backgroundColor: '#4A2814' },
    { id: 'icon:issue-triage', icon: 'alert-circle-outline', color: '#FB7185', backgroundColor: '#4A1D27' },
    { id: 'icon:tasks', icon: 'checkbox-outline', color: '#86EFAC', backgroundColor: '#173F2A' },
    { id: 'icon:kanban', icon: 'apps-outline', color: '#A78BFA', backgroundColor: '#30224F' },
    { id: 'icon:ci', icon: 'play-circle-outline', color: '#34D399', backgroundColor: '#153D31' },
    { id: 'icon:benchmark', icon: 'timer-outline', color: '#FACC15', backgroundColor: '#453912' },
    { id: 'icon:profiler', icon: 'stopwatch-outline', color: '#F97316', backgroundColor: '#4A2814' },
    { id: 'icon:feature-flags', icon: 'flag-outline', color: '#BEF264', backgroundColor: '#334714' },
    { id: 'icon:localization', icon: 'language-outline', color: '#67E8F9', backgroundColor: '#16424A' },
    { id: 'icon:theming', icon: 'contrast-outline', color: '#C084FC', backgroundColor: '#3A2455' },
    { id: 'icon:notifications', icon: 'notifications-outline', color: '#FBBF24', backgroundColor: '#463714' },
    { id: 'icon:billing', icon: 'card-outline', color: '#FDE68A', backgroundColor: '#4A3C17' },
    { id: 'icon:inbox', icon: 'mail-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:upload', icon: 'arrow-up-circle-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:download', icon: 'cloud-download-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:sync', icon: 'sync-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:realtime', icon: 'wifi-outline', color: '#5EEAD4', backgroundColor: '#163C37' },
    { id: 'icon:webhook', icon: 'link-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:integrations', icon: 'share-social-outline', color: '#A78BFA', backgroundColor: '#30224F' },
    { id: 'icon:credentials', icon: 'id-card-outline', color: '#FACC15', backgroundColor: '#453912' },
    { id: 'icon:encryption', icon: 'finger-print-outline', color: '#67E8F9', backgroundColor: '#16424A' },
    { id: 'icon:permissions', icon: 'hand-left-outline', color: '#86EFAC', backgroundColor: '#173F2A' },
    { id: 'icon:policy', icon: 'document-lock-outline', color: '#FDE68A', backgroundColor: '#4A3C17' },
    { id: 'icon:audit', icon: 'clipboard-outline', color: '#FDBA74', backgroundColor: '#4A2A16' },
    { id: 'icon:incident', icon: 'warning-outline', color: '#FB7185', backgroundColor: '#4A1D27' },
    { id: 'icon:health', icon: 'heart-outline', color: '#F472B6', backgroundColor: '#4A1D3A' },
    { id: 'icon:support', icon: 'help-buoy-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:chatops', icon: 'chatbubbles-outline', color: '#C084FC', backgroundColor: '#3A2455' },
    { id: 'icon:alerts', icon: 'mail-unread-outline', color: '#FBBF24', backgroundColor: '#463714' },
    { id: 'icon:workspace', icon: 'folder-open-outline', color: '#FDE68A', backgroundColor: '#453B17' },
    { id: 'icon:monorepo', icon: 'library-outline', color: '#93C5FD', backgroundColor: '#1E3A5F' },
    { id: 'icon:shell', icon: 'chevron-forward-circle-outline', color: '#A3E635', backgroundColor: '#2F3F14' },
    { id: 'icon:remote-access', icon: 'navigate-circle-outline', color: '#38BDF8', backgroundColor: '#14384B' },
    { id: 'icon:agents', icon: 'person-circle-outline', color: '#F0ABFC', backgroundColor: '#4A1F4F' },
    { id: 'icon:playground', icon: 'game-controller-outline', color: '#FB923C', backgroundColor: '#4A2A1A' },
    { id: 'icon:data-pipeline', icon: 'funnel-outline', color: '#2DD4BF', backgroundColor: '#153F3B' },
    { id: 'icon:export', icon: 'download-outline', color: '#60A5FA', backgroundColor: '#17345F' },
    { id: 'icon:snapshot', icon: 'camera-outline', color: '#CBD5E1', backgroundColor: '#293241' },
] as const;

export const PROJECT_ICON_CHOICES: readonly ProjectIconDefinition[] = PROFESSIONAL_PROJECT_ICONS;
export const PROJECT_ICON_IDS: readonly string[] = PROJECT_ICON_CHOICES.map((icon) => icon.id);

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

export function getDefaultProjectIcon(path: string): string {
    const index = hashCode(path) % PROJECT_ICON_CHOICES.length;
    return PROJECT_ICON_CHOICES[index].id;
}

export function getProjectIconIndex(icon: string): number {
    return PROJECT_ICON_IDS.indexOf(icon);
}

export function getProjectIconDefinition(iconId: string): ProjectIconDefinition {
    const found = PROJECT_ICON_CHOICES.find((icon) => icon.id === iconId);
    return found ?? PROJECT_ICON_CHOICES[0];
}

export function normalizeProjectPath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed) {
        return trimmed;
    }

    const prefersWindowsSeparator = /^[A-Za-z]:[\\/]/.test(trimmed) || (trimmed.includes('\\') && !trimmed.includes('/'));
    const separator = prefersWindowsSeparator ? '\\' : '/';
    let normalized = trimmed.replace(/[\\/]+/g, separator);

    if (separator === '\\') {
        if (/^[A-Za-z]:\\?$/.test(normalized)) {
            return normalized.endsWith('\\') ? normalized : `${normalized}\\`;
        }
        normalized = normalized.replace(/\\+$/, '');
    } else if (normalized.length > 1) {
        normalized = normalized.replace(/\/+$/, '');
    }

    return normalized || (separator === '/' ? '/' : trimmed);
}

export function buildProjectKey(machineId: string, path: string): string {
    return `${machineId}:${normalizeProjectPath(path)}`;
}

export function getSessionProjectIcon(
    session: { metadata?: { machineId?: string; path?: string } | null },
    customizations: Record<string, { name?: string; icon?: string }>,
): string {
    const machineId = session.metadata?.machineId;
    const path = session.metadata?.path;
    if (!machineId || !path) return PROJECT_ICON_IDS[0];
    const key = buildProjectKey(machineId, path);
    return customizations[key]?.icon || getDefaultProjectIcon(path);
}
