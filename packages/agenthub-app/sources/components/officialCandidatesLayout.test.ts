import { describe, expect, it } from 'vitest';
import {
    OFFICIAL_CANDIDATE_VISIBLE_ROW_LIMIT,
    getOfficialCandidatesListLayout,
} from './officialCandidatesLayout';

describe('getOfficialCandidatesListLayout', () => {
    it('does not scroll candidate lists that fit within the visible row limit', () => {
        expect(getOfficialCandidatesListLayout(OFFICIAL_CANDIDATE_VISIBLE_ROW_LIMIT, 56)).toEqual({
            scrollEnabled: false,
            maxHeight: undefined,
        });
    });

    it('limits expanded computer sessions to ten rows and enables nested scrolling', () => {
        expect(getOfficialCandidatesListLayout(12, 56)).toEqual({
            scrollEnabled: true,
            maxHeight: 560,
        });
    });
});
