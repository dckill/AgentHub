import { describe, expect, it } from 'vitest';

import { getDiffCodeRowLayout } from './diffLineLayout';

describe('getDiffCodeRowLayout', () => {
    it('keeps nowrap diff lines measurable for horizontal scrolling instead of single-line ellipsis', () => {
        const layout = getDiffCodeRowLayout(false);

        expect(layout.contentTextProps.numberOfLines).toBeUndefined();
        expect(layout.rowStyle).toMatchObject({
            alignSelf: 'flex-start',
            minWidth: '100%',
        });
        expect(layout.codeTextStyle).toMatchObject({
            flexGrow: 0,
            flexShrink: 0,
        });
    });

    it('keeps wrapped diff lines stretched to the reader width', () => {
        const layout = getDiffCodeRowLayout(true);

        expect(layout.contentTextProps.numberOfLines).toBeUndefined();
        expect(layout.rowStyle).toMatchObject({
            alignSelf: 'stretch',
            minWidth: '100%',
        });
        expect(layout.codeTextStyle).toMatchObject({
            flex: 1,
            minWidth: 0,
        });
    });
});
