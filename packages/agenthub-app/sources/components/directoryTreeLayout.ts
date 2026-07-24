type ScaleFn = (value: number) => number;

const BASE_PADDING_LEFT = 8;
const DEPTH_INDENT = 14;
const MAX_PADDING_LEFT = 112;

export function getDirectoryTreeNodePaddingLeft(depth: number, scale: ScaleFn = (value) => value): number {
    const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
    const rawPadding = BASE_PADDING_LEFT + safeDepth * DEPTH_INDENT;
    return Math.min(scale(rawPadding), scale(MAX_PADDING_LEFT));
}
