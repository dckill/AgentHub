export type KeyboardEventLike = {
    key?: string;
    nativeEvent?: { key?: string };
    preventDefault?: () => void;
};

export function activateOnSpaceKey(event: KeyboardEventLike, onActivate: () => void): boolean {
    const key = event.nativeEvent?.key ?? event.key;
    if (key !== ' ' && key !== 'Spacebar') {
        return false;
    }

    event.preventDefault?.();
    onActivate();
    return true;
}
