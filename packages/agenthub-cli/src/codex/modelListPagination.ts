import type {
    CodexModel,
    ModelListParams,
    ModelListResponse,
} from './codexAppServerTypes';

export type ModelListPaginationParams = {
    includeHidden: boolean;
    fetchPage: (params: ModelListParams) => Promise<ModelListResponse>;
};

/** Fetch all model/list pages while preserving first-seen order and de-duplicating model names. */
export async function fetchAllCodexModels(
    params: ModelListPaginationParams,
): Promise<CodexModel[]> {
    const models: CodexModel[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;

    do {
        const page = await params.fetchPage({
            cursor,
            limit: 100,
            includeHidden: params.includeHidden,
        });
        for (const model of page.data) {
            if (seen.has(model.model)) continue;
            seen.add(model.model);
            models.push(model);
        }
        cursor = page.nextCursor;
    } while (cursor);

    return models;
}
