const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Config plugin to optimize gradle.properties for faster builds.
 * Applied during prebuild so changes survive android/ regeneration.
 */
const withGradleOptimizations = (config) => {
    return withGradleProperties(config, (config) => {
        const props = config.modResults;
        const androidArchitectures = process.env.AGENTHUB_ANDROID_ARCHITECTURES || 'arm64-v8a';

        const setProperty = (key, value) => {
            const existing = props.find(
                (p) => p.type === 'property' && p.key === key
            );
            if (existing) {
                existing.value = value;
            } else {
                props.push({ type: 'property', key, value });
            }
        };

        // JVM memory — 4GB heap for 40+ native modules
        setProperty('org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError');

        // Enable build cache (incremental builds)
        setProperty('org.gradle.caching', 'true');

        // Expo/RN Gradle scripts invoke Node during configuration; Gradle 9 treats
        // that as configuration-cache incompatible in this generated project.
        setProperty('org.gradle.configuration-cache', 'false');

        // Keep daemon alive between builds
        setProperty('org.gradle.daemon', 'true');

        // Personal Android build target: only physical arm64 devices are needed.
        // Override with AGENTHUB_ANDROID_ARCHITECTURES if emulator/multi-ABI builds are required.
        setProperty('reactNativeArchitectures', androidArchitectures);

        // Compress native .so files in the APK. This reduces the sideload artifact
        // substantially for personal distribution, at the cost of install-time extraction.
        setProperty('expo.useLegacyPackaging', 'true');

        // Keep preview/release builds from carrying Expo dev-client network inspection.
        setProperty('EX_DEV_CLIENT_NETWORK_INSPECTOR', 'false');

        return config;
    });
};

module.exports = withGradleOptimizations;
