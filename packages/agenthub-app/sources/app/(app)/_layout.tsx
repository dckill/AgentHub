import { Redirect, Stack, useSegments } from 'expo-router';
import Constants from 'expo-constants';
import 'react-native-reanimated';
import * as React from 'react';
import { Typography } from '@/constants/Typography';
import { createHeader } from '@/components/navigation/Header';
import { Platform, TouchableOpacity, Text } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { getNavigationStackVisuals } from '@/components/navigationShellVisuals';
import { useAuth } from '@/auth/AuthContext';
import { isPublicUnauthenticatedRoute } from '@/auth/authRouteGuard';
import { isPreviewDevRoute, type AppVariant } from '@/router/devRouteBoundary';

export const unstable_settings = {
    initialRouteName: 'index',
};

function DevRouteScreens() {
    return (
        <>
            <Stack.Screen name="dev/index" options={{ headerTitle: 'Developer Tools' }} />
            <Stack.Screen name="dev/list-demo" options={{ headerTitle: 'List Components Demo' }} />
            <Stack.Screen name="dev/typography" options={{ headerTitle: 'Typography' }} />
            <Stack.Screen name="dev/colors" options={{ headerTitle: 'Colors' }} />
            <Stack.Screen name="dev/tools2" options={{ headerTitle: 'Tool Views Demo' }} />
            <Stack.Screen name="dev/code-surfaces" options={{ headerTitle: 'Code Surfaces' }} />
            <Stack.Screen name="dev/lifecycle-status" options={{ headerShown: false }} />
            <Stack.Screen name="dev/agent-input-demo" options={{ headerTitle: 'Agent Input Demo' }} />
            <Stack.Screen name="dev/shimmer-demo" options={{ headerTitle: 'Shimmer View Demo' }} />
            <Stack.Screen name="dev/multi-text-input" options={{ headerTitle: 'Multi Text Input' }} />
            <Stack.Screen name="dev/session-composer" options={{ headerTitle: 'Session Composer' }} />
        </>
    );
}

export default function RootLayout() {
    const auth = useAuth();
    const segments = useSegments();
    const publicAppVariant = process.env.EXPO_PUBLIC_AGENTHUB_APP_VARIANT;
    const appVariant = (
        publicAppVariant === 'development' || publicAppVariant === 'preview' || publicAppVariant === 'production'
            ? publicAppVariant
            : Constants.expoConfig?.extra?.app?.variant
    ) as AppVariant;
    const exposeDevRoutes = __DEV__ || process.env.EXPO_PUBLIC_AGENTHUB_APP_VARIANT === 'preview';
    const previewDevRoute = isPreviewDevRoute(appVariant, segments);
    // Use custom header on Android and Mac Catalyst, native header on iOS (non-Catalyst)
    const shouldUseCustomHeader = Platform.OS === 'android' || isRunningOnMac() || Platform.OS === 'web';
    const { theme } = useUnistyles();
    const stackVisuals = getNavigationStackVisuals(theme);

    if (!auth.isAuthenticated && !isPublicUnauthenticatedRoute(segments) && !previewDevRoute) {
        return <Redirect href="/" />;
    }

    return (
        <Stack
            initialRouteName='index'
            screenOptions={{
                header: shouldUseCustomHeader ? createHeader : undefined,
                headerBackTitle: t('common.back'),
                headerShadowVisible: false,
                contentStyle: {
                    backgroundColor: stackVisuals.contentBackgroundColor,
                },
                headerStyle: {
                    backgroundColor: stackVisuals.headerBackgroundColor,
                },
                headerTintColor: stackVisuals.headerTintColor,
                headerTitleStyle: {
                    color: stackVisuals.headerTintColor,
                    ...Typography.default('semiBold'),
                },

            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    headerShown: false,
                    headerTitle: ''
                }}
            />
            <Stack.Screen
                name="settings/index"
                options={{
                    headerShown: true,
                    headerTitle: t('settings.title'),
                    headerBackTitle: t('common.home')
                }}
            />
            <Stack.Screen
                name="machines/index"
                options={{
                    headerShown: true,
                    headerTitle: t('tabs.machines'),
                    headerBackTitle: t('common.home')
                }}
            />
            <Stack.Screen
                name="machine/[id]"
                options={{
                    headerShown: true,
                    headerTitle: '',
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="machine/[id]/files"
                options={{
                    headerShown: true,
                    headerTitle: t('fileBrowser.title'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="transfers"
                options={{
                    headerShown: true,
                    headerTitle: t('transferManager.title'),
                    headerBackTitle: t('tabs.machines'),
                }}
            />
            <Stack.Screen
                name="session/[id]"
                options={{
                    headerShown: false
                }}
            />
            <Stack.Screen
                name="session/[id]/message/[messageId]"
                options={{
                    headerShown: true,
                    headerBackTitle: t('common.back'),
                    headerTitle: t('common.message')
                }}
            />
            <Stack.Screen
                name="session/[id]/info"
                options={{
                    headerShown: true,
                    headerTitle: '',
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="session/[id]/files"
                options={{
                    headerShown: true,
                    headerTitle: t('common.files'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="session/[id]/git-log"
                options={{
                    headerShown: true,
                    headerTitle: t('gitActions.gitLog'),
                    headerBackTitle: t('common.files'),
                }}
            />
            <Stack.Screen
                name="session/[id]/file"
                options={{
                    headerShown: true,
                    headerTitle: t('common.fileViewer'),
                    headerBackTitle: t('common.files'),
                }}
            />
            <Stack.Screen
                name="settings/account"
                options={{
                    headerTitle: t('settings.account'),
                }}
            />
            <Stack.Screen
                name="settings/credentials"
                options={{
                    headerTitle: t('credentials.title'),
                }}
            />
            <Stack.Screen
                name="settings/credentials/edit"
                options={{
                    headerTitle: t('credentials.addCredential'),
                }}
            />
            <Stack.Screen
                name="settings/appearance"
                options={{
                    headerTitle: t('settings.appearance'),
                }}
            />
            <Stack.Screen
                name="settings/language"
                options={{
                    headerTitle: t('settingsLanguage.currentLanguage'),
                }}
            />
            <Stack.Screen
                name="settings/usage"
                options={{
                    headerTitle: t('settings.usage'),
                }}
            />
            <Stack.Screen
                name="settings/shared-links"
                options={{ headerTitle: t('externalShares.title') }}
            />
            <Stack.Screen
                name="share/[id]"
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="settings/session-scale"
                options={{
                    headerTitle: t('settingsAppearance.sessionScale'),
                }}
            />
            <Stack.Screen
                name="settings/chat-scale"
                options={{
                    headerTitle: t('settingsAppearance.chatScale'),
                }}
            />
            <Stack.Screen
                name="settings/file-scale"
                options={{
                    headerTitle: t('settingsAppearance.fileScale'),
                }}
            />
            <Stack.Screen
                name="settings/file-list-scale"
                options={{
                    headerTitle: t('settingsAppearance.fileListScale'),
                }}
            />
            <Stack.Screen
                name="settings/device-scale"
                options={{
                    headerTitle: t('settingsAppearance.deviceScale'),
                }}
            />
            <Stack.Screen
                name="settings/settings-scale"
                options={{
                    headerTitle: t('settingsAppearance.settingsScale'),
                }}
            />
            <Stack.Screen
                name="settings/features"
                options={{
                    headerTitle: t('settings.features'),
                }}
            />
            <Stack.Screen
                name="restore/index"
                options={{
                    headerShown: true,
                    headerTitle: t('navigation.linkNewDevice'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="restore/manual"
                options={{
                    headerShown: true,
                    headerTitle: t('navigation.restoreWithSecretKey'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="changelog"
                options={{
                    headerShown: true,
                    headerTitle: t('navigation.whatsNew'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="artifacts/index"
                options={{
                    headerShown: true,
                    headerTitle: t('artifacts.title'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="artifacts/[id]"
                options={{
                    headerShown: false, // We'll set header dynamically
                }}
            />
            <Stack.Screen
                name="artifacts/new"
                options={{
                    headerShown: true,
                    headerTitle: t('artifacts.new'),
                    headerBackTitle: t('common.cancel'),
                }}
            />
            <Stack.Screen
                name="artifacts/edit/[id]"
                options={{
                    headerShown: true,
                    headerTitle: t('artifacts.edit'),
                    headerBackTitle: t('common.cancel'),
                }}
            />
            <Stack.Screen
                name="text-selection"
                options={{
                    headerShown: true,
                    headerTitle: t('textSelection.title'),
                    headerBackTitle: t('common.back'),
                }}
            />
            {exposeDevRoutes && <DevRouteScreens />}
            <Stack.Screen
                name="session/recent"
                options={{
                    headerShown: true,
                    headerTitle: t('sessionHistory.title'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="new/index"
                options={{
                    headerTitle: t('newSession.title'),
                    headerBackTitle: t('common.back'),
                }}
            />
            <Stack.Screen
                name="new/path"
                options={{ headerShown: false }}
            />
        </Stack>
    );
}
