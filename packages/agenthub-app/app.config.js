const agentHubBrandAssets = {
    icon: "./sources/assets/images/agenthub-icon.png",
    adaptiveIcon: "./sources/assets/images/agenthub-icon-adaptive.png",
    monochromeIcon: "./sources/assets/images/agenthub-icon-monochrome.png",
    notificationIcon: "./sources/assets/images/agenthub-icon-notification.png",
    favicon: "./sources/assets/images/agenthub-favicon.png",
    splash: "./sources/assets/images/agenthub-icon.png",
};

const variant = ['preview', 'production'].includes(process.env.APP_ENV) ? process.env.APP_ENV : 'development';
const name = {
    development: "AgentHub (dev)",
    preview: "AgentHub (preview)",
    production: "AgentHub"
}[variant];
const bundleId = {
    development: "com.artsum.agenthub.dev",
    preview: "com.artsum.agenthub.preview",
    production: "com.artsum.agenthub"
}[variant];
const consoleLoggingDefault = {
    development: true,
    preview: true,
    production: false,
}[variant];
const easProjectId = "9c99be0c-320b-425a-b469-5ecfba53488c";
const otaDisabled = process.env.EXPO_NO_OTA === 'true' || process.env.NO_OTA === 'true';

export default {
    expo: {
        name,
        slug: "agenthub",
        version: "1.0.0",
        runtimeVersion: "1",
        updates: {
            enabled: !otaDisabled,
            enableBsdiffPatchSupport: true,
            url: `https://u.expo.dev/${easProjectId}`,
            checkAutomatically: "ON_LOAD",
            fallbackToCacheTimeout: 0,
            requestHeaders: {
                "expo-channel-name": variant
            }
        },
        orientation: "default",
        icon: agentHubBrandAssets.icon,
        scheme: "agenthub",
        userInterfaceStyle: "automatic",
        ios: {
            supportsTablet: true,
            bundleIdentifier: bundleId,
            config: {
                usesNonExemptEncryption: false
            },
            infoPlist: {
                NSFaceIDUsageDescription: "Use Face ID to protect access to your AgentHub recovery key.",
                NSLocalNetworkUsageDescription: "Allow $(PRODUCT_NAME) to find and connect to local devices on your network.",
                NSBonjourServices: ["_http._tcp", "_https._tcp"]
            },
            associatedDomains: []
        },
        android: {
            ...(variant === 'production' ? { googleServicesFile: "./google-services.json" } : {}),
            adaptiveIcon: {
                foregroundImage: agentHubBrandAssets.adaptiveIcon,
                monochromeImage: agentHubBrandAssets.monochromeIcon,
                backgroundColor: "#070A0B"
            },
            permissions: [
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.POST_NOTIFICATIONS",
                "android.permission.REQUEST_INSTALL_PACKAGES",
            ],
            blockedPermissions: [
                "android.permission.ACTIVITY_RECOGNITION",
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
            ],
            package: bundleId,
            intentFilters: []
        },
        web: {
            bundler: "metro",
            output: "single",
            favicon: agentHubBrandAssets.favicon
        },
        plugins: [
            require("./plugins/withEinkCompatibility.js"),
            require("./plugins/withGradleOptimizations.js"),
            require("./plugins/withAndroidUploadSigning.js"),
            require("./plugins/withAndroidFileIntents.js"),
            require("./plugins/withAndroidPermissionPolicy.js"),
            require("./plugins/withAndroidBackNavigationPolicy.js"),
            [
                "expo-router",
                {
                    root: "./sources/app"
                }
            ],
            "expo-asset",
            "expo-localization",
            "expo-secure-store",
            "expo-web-browser",
            "@more-tech/react-native-libsodium",
            [
                "expo-camera",
                {
                    cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan QR codes and share photos with AI.",
                    recordAudioAndroid: false
                }
            ],
            [
                "expo-notifications",
                {
                    enableBackgroundRemoteNotifications: true,
                    icon: agentHubBrandAssets.notificationIcon
                }
            ],
            [
                'expo-splash-screen',
                {
                    ios: {
                        backgroundColor: "#F7F3EA",
                        image: agentHubBrandAssets.splash,
                        imageWidth: 100,
                        dark: {
                            image: agentHubBrandAssets.splash,
                            imageWidth: 100,
                            backgroundColor: "#101416",
                        }
                    },
                    android: {
                        image: agentHubBrandAssets.splash,
                        imageWidth: 100,
                        backgroundColor: "#F7F3EA",
                        dark: {
                            image: agentHubBrandAssets.splash,
                            imageWidth: 100,
                            backgroundColor: "#101416",
                        }
                    }
                }
            ]
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            eas: {
                projectId: easProjectId,
            },
            router: {
                root: "./sources/app"
            },
            app: {
                variant,
                consoleLoggingDefault,
            }
        },
    }
};
