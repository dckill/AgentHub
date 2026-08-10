export type ProjectCustomization = { name?: string; icon?: string; archived?: boolean };

export function shouldRenderProjectSessionCard(activeCount: number, officialCount: number): boolean {
    return activeCount > 0 || officialCount > 0;
}

export function restoreProjectCustomizationForExplicitSession(
    projectCustomizations: Record<string, ProjectCustomization>,
    projectKey: string,
): Record<string, ProjectCustomization> {
    const current = projectCustomizations[projectKey];
    if (!current?.archived) return projectCustomizations;
    const { archived: _archived, ...restored } = current;
    return { ...projectCustomizations, [projectKey]: restored };
}
