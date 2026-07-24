const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidBackNavigationPolicy = (config) => withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    const application = manifest.application?.[0];

    if (application?.$) {
        application.$['android:enableOnBackInvokedCallback'] = 'false';
    }

    return manifestConfig;
});

module.exports = withAndroidBackNavigationPolicy;
