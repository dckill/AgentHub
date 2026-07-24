import * as React from 'react';
import { View } from 'react-native';
import { PierreDiffView } from '@/components/diff/PierreDiffView';
import { useSetting } from '@/sync/storage';
import { useChatScale } from '@/hooks/useScale';

interface ToolDiffViewProps {
    /** Pre-built unified-diff patch string. Preferred when available. */
    patch?: string;
    /** Pair used to derive a patch if `patch` isn't supplied. */
    oldText?: string;
    newText?: string;
    /** File name — used for language detection in syntax highlighting. */
    fileName?: string;
    style?: any;
    /** Enables bounded internal scrolling for full-screen file review surfaces. */
    scrollable?: boolean;
    /** No-op in the new renderer (pierre/diffs always draws line numbers via gutter). Kept for source compat. */
    showLineNumbers?: boolean;
    /** No-op in the new renderer; pierre/diffs uses classic indicators. */
    showPlusMinusSymbols?: boolean;
    /** Multiplies diff font, line height, and gutters. Defaults to chatScale. */
    scaleMultiplier?: number;
}

export const ToolDiffView = React.memo<ToolDiffViewProps>(({
    patch,
    oldText,
    newText,
    fileName,
    style,
    scrollable,
    showLineNumbers,
    scaleMultiplier,
}) => {
    const wrapLines = useSetting('wrapLinesInDiffs');
    const { scale: chatScale } = useChatScale();

    const effectiveFileName = fileName ?? 'file.txt';

    // Chat tool diffs are always inline unified — the split view lives on the
    // dedicated InlineFileDiff pane (controlled via the diffStyle setting).
    const common = {
        overflow: wrapLines ? ('wrap' as const) : ('scroll' as const),
        disableLineNumbers: !(showLineNumbers ?? true),
        disableFileHeader: true,
        diffStyle: 'unified' as const,
        scrollable,
        scaleMultiplier: scaleMultiplier ?? chatScale,
    };

    if (patch) {
        return (
            <View style={[{ flex: 1 }, style]}>
                <PierreDiffView patch={patch} fileName={fileName} {...common} />
            </View>
        );
    }

    return (
        <View style={[{ flex: 1 }, style]}>
            <PierreDiffView
                oldFile={{ name: effectiveFileName, contents: oldText ?? '' }}
                newFile={{ name: effectiveFileName, contents: newText ?? '' }}
                {...common}
            />
        </View>
    );
});
