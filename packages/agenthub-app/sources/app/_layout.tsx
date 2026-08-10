import 'react-native-quick-base64';
import '../theme.css';
import * as React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Fonts from 'expo-font';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { AuthCredentials, TokenStorage } from '@/auth/tokenStorage';
import { AuthProvider } from '@/auth/AuthContext';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SidebarNavigator } from '@/components/SidebarNavigator';
import { View, Platform, Pressable, Text } from 'react-native';
import { ModalProvider } from '@/modal';
import { syncRestore, syncShutdown } from '@/sync/sync';
import { useTrackScreens } from '@/track/useTrackScreens';
import { FaviconPermissionIndicator } from '@/components/web/FaviconPermissionIndicator';
import { CommandPaletteProvider } from '@/components/CommandPalette/CommandPaletteProvider';
import { StatusBarProvider } from '@/components/StatusBarProvider';
// import * as SystemUI from 'expo-system-ui';
import { initConsoleLogging, setConsoleOutputEnabled } from '@/utils/consoleLogging';
import { useLocalSetting } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { AsyncLock } from '@/utils/lock';
import { getSessionRouteFromNotificationResponse } from '@/utils/notificationRouting';
import { navigateToSession } from '@/hooks/useNavigateToSession';
import { useTauriZoom } from '@/hooks/useTauriZoom';
import { useTauriDrag } from '@/hooks/useTauriDrag';
import { getReactNavigationTheme } from '@/components/navigationShellVisuals';
import { consumeDevWebCredentials } from '@/auth/devWebCredentials';
import { initializeRootRuntime, type RootInitializationState } from '@/auth/rootInitialization';
import { Typography } from '@/constants/Typography';
import { loadCurrentTranslations, t } from '@/text';
import { BrowserNavigationShortcuts } from '@/hooks/useBrowserNavigationShortcuts';

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// Setup Android notification channel (required for Android 8.0+)
if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
    });
}

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary,
} from 'expo-router';

// Configure splash screen
SplashScreen.setOptions({
    fade: true,
    duration: 300,
})
SplashScreen.preventAutoHideAsync();

// Set window background color - now handled by Unistyles
// SystemUI.setBackgroundColorAsync('white');

// Component to apply horizontal safe area padding
function HorizontalSafeAreaWrapper({ children }: { children: React.ReactNode }) {
    const insets = useSafeAreaInsets();
    return (
        <View style={{
            flex: 1,
            paddingLeft: insets.left,
            paddingRight: insets.right
        }}>
            {children}
        </View>
    );
}

let lock = new AsyncLock();
let loaded = false;

async function loadFonts() {
    await lock.inLock(async () => {
        if (loaded) {
            return;
        }
        loaded = true;
        // Check if running in Tauri
        const isTauri = Platform.OS === 'web' &&
            typeof window !== 'undefined' &&
            (window as any).__TAURI_INTERNALS__ !== undefined;
        const coreFonts = {
            'IBMPlexSans-Regular': require('@/assets/fonts/IBMPlexSans-Regular.ttf'),
            'IBMPlexSans-SemiBold': require('@/assets/fonts/IBMPlexSans-SemiBold.ttf'),
            'IBMPlexMono-Regular': require('@/assets/fonts/IBMPlexMono-Regular.ttf'),
        };

        if (!isTauri) {
            await Fonts.loadAsync(coreFonts);
        } else {
            // Tauri keeps its non-blocking startup behavior; these same core fonts
            // still become available once the WebView has loaded their assets.
            void Fonts.loadAsync(coreFonts).catch(() => undefined);
        }
    });
}

function getDevEnvironmentCredentials(): AuthCredentials | null {
    if (!__DEV__) {
        return null;
    }

    const token = process.env.EXPO_PUBLIC_DEV_TOKEN;
    const secret = process.env.EXPO_PUBLIC_DEV_SECRET;
    if (!token || !secret) {
        return null;
    }

    return { token, secret };
}

const initialDevWebQueryCredentials = consumeDevWebCredentials({
    isDevelopment: __DEV__,
    platform: Platform.OS,
    location: typeof window === 'undefined' ? null : window.location,
    replaceState: (url) => window.history.replaceState({}, '', url),
});

function scrubDevWebCredentialUrl(replaceRoute: (url: string) => void): void {
    consumeDevWebCredentials({
        isDevelopment: false,
        platform: Platform.OS,
        location: typeof window === 'undefined' ? null : window.location,
        replaceState: (url) => {
            window.history.replaceState({}, '', url);
            replaceRoute(url);
        },
    });
}

function RootInitializationError({ onRetry }: { onRetry: () => void }) {
    const { theme } = useUnistyles();
    return (
        <View
            accessibilityLiveRegion="polite"
            style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                backgroundColor: theme.colors.groupped.background,
            }}
        >
            <View style={{
                width: '100%',
                maxWidth: 440,
                padding: 24,
                borderRadius: 20,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.divider,
            }}>
                <Text accessibilityRole="header" style={{
                    color: theme.colors.text,
                    fontSize: 22,
                    lineHeight: 28,
                    ...Typography.default('semiBold'),
                }}>
                    {t('errors.authenticationFailed')}
                </Text>
                <Text style={{
                    marginTop: 10,
                    color: theme.colors.textSecondary,
                    fontSize: 15,
                    lineHeight: 22,
                    ...Typography.default(),
                }}>
                    {t('errors.tryAgain')}. {t('errors.contactSupport')}.
                </Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                    focusable
                    onPress={onRetry}
                    style={({ pressed }) => ({
                        minHeight: 44,
                        marginTop: 20,
                        paddingHorizontal: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                        backgroundColor: theme.colors.accent,
                        opacity: pressed ? 0.82 : 1,
                    })}
                >
                    <Text style={{
                        color: theme.colors.button.primary.tint,
                        fontSize: 15,
                        ...Typography.default('semiBold'),
                    }}>
                        {t('common.retry')}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

export default function RootLayout() {
    useTauriZoom();
    useTauriDrag();
    const router = useRouter();
    const { theme } = useUnistyles();
    const navigationTheme = React.useMemo(() => {
        return getReactNavigationTheme(theme, theme.dark ? DarkTheme : DefaultTheme);
    }, [theme]);

    //
    // Init sequence
    //
    const [initState, setInitState] = React.useState<RootInitializationState>({ status: 'loading' });
    const [initializationAttempt, setInitializationAttempt] = React.useState(0);
    React.useEffect(() => {
        // Storage-backed logging configuration is client-only. Running this at
        // module scope breaks production Web static rendering.
        initConsoleLogging();
        let active = true;
        setInitState({ status: 'loading' });
        void initializeRootRuntime({
            loadAssets: async () => {
                await loadFonts();
                await loadCurrentTranslations();
            },
            getCredentials: async () => {
                let credentials = await TokenStorage.getCredentials();
                const devCredentials = initialDevWebQueryCredentials ?? getDevEnvironmentCredentials();

                if (devCredentials) {
                    const credentialsChanged = credentials?.token !== devCredentials.token
                        || credentials?.secret !== devCredentials.secret;

                    if (credentialsChanged) {
                        const saved = await TokenStorage.setCredentials(devCredentials);
                        if (saved) {
                            credentials = devCredentials;
                        }
                    }
                }
                return credentials;
            },
            restore: syncRestore,
            cleanup: syncShutdown,
            onError: (error) => {
                console.error('Error initializing:', {
                    error,
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : null,
                    cause: error instanceof Error ? error.cause : null,
                });
            },
        }).then((state) => {
            if (active) {
                setInitState(state);
            }
        });
        return () => {
            active = false;
        };
    }, [initializationAttempt]);

    React.useEffect(() => {
        if (initState.status !== 'loading') {
            // Expo Router can reconcile its initially captured query after module
            // evaluation. Scrub a second time after the authenticated tree mounts.
            scrubDevWebCredentialUrl((url) => router.replace(url as never));
            setTimeout(() => {
                SplashScreen.hideAsync();
            }, 100);
        }
    }, [initState, router]);

    const handledNotificationIds = React.useRef<Set<string>>(new Set());
    const handleNotificationResponse = React.useCallback(async (response: Notifications.NotificationResponse | null) => {
        if (!response) {
            return;
        }

        const responseId = response.notification.request.identifier;
        if (handledNotificationIds.current.has(responseId)) {
            return;
        }

        handledNotificationIds.current.add(responseId);

        try {
            if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
                return;
            }

            const route = getSessionRouteFromNotificationResponse(response);
            if (!route) {
                return;
            }

            const encodedSessionId = route.replace(/^\/session\//, '');
            const sessionId = (() => {
                try {
                    return decodeURIComponent(encodedSessionId);
                } catch {
                    return encodedSessionId;
                }
            })();
            navigateToSession(router, sessionId);
        } finally {
            try {
                await Notifications.clearLastNotificationResponseAsync();
            } catch (error) {
                console.warn('Failed to clear last notification response:', error);
            }
        }
    }, [router]);

    React.useEffect(() => {
        if (!initState) {
            return;
        }

        let active = true;
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            void handleNotificationResponse(response);
        });

        void (async () => {
            try {
                const response = await Notifications.getLastNotificationResponseAsync();
                if (active) {
                    await handleNotificationResponse(response);
                }
            } catch (error) {
                console.warn('Failed to read last notification response:', error);
            }
        })();

        return () => {
            active = false;
            subscription.remove();
        };
    }, [handleNotificationResponse, initState]);


    // Track the screens
    useTrackScreens()

    // Sync console output toggle from Dev screen
    const consoleLoggingEnabled = useLocalSetting('consoleLoggingEnabled');
    const devModeEnabled = __DEV__ || useLocalSetting('devModeEnabled');
    React.useEffect(() => {
        setConsoleOutputEnabled(consoleLoggingEnabled);
    }, [consoleLoggingEnabled]);

    //
    // Not inited
    //

    if (initState.status === 'loading') {
        return null;
    }

    if (initState.status === 'error') {
        return <RootInitializationError onRetry={() => setInitializationAttempt((attempt) => attempt + 1)} />;
    }

    //
    // Boot
    //

    const providers = (
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <KeyboardProvider preload={false}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <AuthProvider initialCredentials={initState.credentials}>
                        <ThemeProvider value={navigationTheme}>
                            <StatusBarProvider />
                            <ModalProvider>
                                <BrowserNavigationShortcuts />
                                <CommandPaletteProvider>
                                    <HorizontalSafeAreaWrapper>
                                        <SidebarNavigator />
                                    </HorizontalSafeAreaWrapper>
                                </CommandPaletteProvider>
                            </ModalProvider>
                        </ThemeProvider>
                    </AuthProvider>
                </GestureHandlerRootView>
            </KeyboardProvider>
        </SafeAreaProvider>
    );

    return (
        <>
            <FaviconPermissionIndicator />
            {providers}
        </>
    );
}
