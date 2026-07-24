export interface InteractiveItemLayoutInput {
    hasRowPress: boolean;
    hasRightElement: boolean;
    rightElementInteractive: boolean;
}

export function shouldSplitInteractiveItem(input: InteractiveItemLayoutInput): boolean {
    return input.hasRowPress && input.hasRightElement && input.rightElementInteractive;
}
