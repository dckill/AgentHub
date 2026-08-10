import { useModal } from '@/modal';
import { canRouteForward, canUseRouteBack, getNavigatorCanGoBack, getKeyboardNavigationDirection, getMouseNavigationDirection } from '@/navigation/browserNavigation';
import { useBrowserNavigationStore } from '@/navigation/browserNavigationStore';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import * as React from 'react';
import { Platform } from 'react-native';

function runRouteBack(router: ReturnType<typeof useRouter>): boolean {
    const navigation = useBrowserNavigationStore.getState();
    if (!navigation.routeHistory || !canUseRouteBack(navigation.routeHistory, getNavigatorCanGoBack(router))) return false;
    navigation.markRouteBack();
    router.back();
    return true;
}

function runRouteForward(): boolean {
    const navigation = useBrowserNavigationStore.getState();
    if (!navigation.routeHistory || !canRouteForward(navigation.routeHistory) || typeof window === 'undefined') return false;
    navigation.markRouteForward();
    window.history.forward();
    return true;
}

export function useBrowserNavigationShortcuts() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useGlobalSearchParams();
    const { dismissTopModal } = useModal();
    const syncRoutePathname = useBrowserNavigationStore((state) => state.syncRoutePathname);
    const mouseNavigationHandledRef = React.useRef(false);
    const routeKey = React.useMemo(() => Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : pathname, [pathname, searchParams]);

    React.useEffect(() => syncRoutePathname(routeKey), [routeKey, syncRoutePathname]);

    const runBack = React.useCallback(() => {
        if (dismissTopModal()) return true;
        return runRouteBack(router);
    }, [dismissTopModal, router]);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (getKeyboardNavigationDirection(event) !== 'back' || !runBack()) return;
            event.preventDefault();
            event.stopPropagation();
        };
        const onMouseUp = (event: MouseEvent) => {
            const direction = getMouseNavigationDirection(event);
            if (!direction) return;
            const handled = direction === 'back' ? runBack() : runRouteForward();
            mouseNavigationHandledRef.current = handled;
            if (handled) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        const onAuxClick = (event: MouseEvent) => {
            if (!getMouseNavigationDirection(event) || !mouseNavigationHandledRef.current) return;
            mouseNavigationHandledRef.current = false;
            event.preventDefault();
            event.stopPropagation();
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mouseup', onMouseUp, true);
        window.addEventListener('auxclick', onAuxClick, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mouseup', onMouseUp, true);
            window.removeEventListener('auxclick', onAuxClick, true);
        };
    }, [runBack]);
}

export function BrowserNavigationShortcuts() {
    useBrowserNavigationShortcuts();
    return null;
}
