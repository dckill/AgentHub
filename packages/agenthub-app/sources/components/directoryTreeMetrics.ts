type ScaleMeasurement = (value: number) => number;

export type DirectoryTreeRowMetrics = {
    rowMinHeight: number;
    fontSize: number;
    lineHeight: number;
    fileIconSize: number;
    folderIconSize: number;
    chevronSize: number;
};

export function getDirectoryTreeRowMetrics(
    scale: ScaleMeasurement,
    preserveTouchTarget: boolean,
): DirectoryTreeRowMetrics {
    return {
        rowMinHeight: preserveTouchTarget ? 44 : Math.max(24, scale(40)),
        fontSize: scale(16),
        lineHeight: scale(22),
        fileIconSize: scale(28),
        folderIconSize: scale(24),
        chevronSize: scale(14),
    };
}
