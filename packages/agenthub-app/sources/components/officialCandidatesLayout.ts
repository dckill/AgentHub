export const OFFICIAL_CANDIDATE_VISIBLE_ROW_LIMIT = 10;

export function getOfficialCandidatesListLayout(candidateCount: number, rowHeight: number): {
    scrollEnabled: boolean;
    maxHeight?: number;
} {
    if (candidateCount <= OFFICIAL_CANDIDATE_VISIBLE_ROW_LIMIT) {
        return {
            scrollEnabled: false,
            maxHeight: undefined,
        };
    }

    return {
        scrollEnabled: true,
        maxHeight: rowHeight * OFFICIAL_CANDIDATE_VISIBLE_ROW_LIMIT,
    };
}
