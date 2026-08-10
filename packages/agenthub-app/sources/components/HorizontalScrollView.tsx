import * as React from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import { resolveHorizontalWheelDelta } from './horizontalWheelScroll';

// Horizontal wheel scroll for tables/code blocks inside the inverted chat list.
//
// Both the inverted chat list's wheel listener and Chromium's transformed
// nested scroller behavior make native horizontal scrolling unreliable. The
// handler therefore claims horizontal-dominant events and applies scrollLeft
// itself, while vertical-dominant events continue to the parent list.
//
// Shift + wheel always converts vertical to horizontal (mouse wheel users).
function useHorizontalWheelScroll() {
    const ref = React.useRef<ScrollView>(null);
    React.useEffect(() => {
        if (Platform.OS !== 'web' || !ref.current) return;
        const node = (ref.current as any)?.getScrollableNode?.() ?? (ref.current as any);
        if (!node || !node.addEventListener) return;

        const handler = (e: WheelEvent) => {
            const el = node as HTMLElement;
            const maxScroll = el.scrollWidth - el.clientWidth;
            const delta = resolveHorizontalWheelDelta({
                deltaX: e.deltaX,
                deltaY: e.deltaY,
                shiftKey: e.shiftKey,
                scrollLeft: el.scrollLeft,
                maxScroll,
            });
            if (delta === null) return;

            e.preventDefault();
            e.stopPropagation();
            el.scrollLeft += delta;
        };
        node.addEventListener('wheel', handler, { passive: false });
        return () => node.removeEventListener('wheel', handler);
    }, []);
    return ref;
}

type Props = Omit<ScrollViewProps, 'horizontal'>;

export function HorizontalScrollView(props: Props) {
    const {
        showsHorizontalScrollIndicator = true,
        nestedScrollEnabled = true,
        ...rest
    } = props;
    const ref = useHorizontalWheelScroll();
    return (
        <ScrollView
            ref={ref}
            horizontal
            showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
            nestedScrollEnabled={nestedScrollEnabled}
            {...rest}
        />
    );
}
