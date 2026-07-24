const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVED_PERMISSIONS = [
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
];

function removePermission(manifest, name) {
    manifest['uses-permission'] ??= [];
    const existing = manifest['uses-permission'].find((permission) => (
        permission.$?.['android:name'] === name
    ));
    if (existing) {
        existing.$['tools:node'] = 'remove';
        return;
    }
    manifest['uses-permission'].push({
        $: {
            'android:name': name,
            'tools:node': 'remove',
        },
    });
}

const withAndroidPermissionPolicy = (config) => withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    for (const permission of REMOVED_PERMISSIONS) {
        removePermission(manifest, permission);
    }
    return manifestConfig;
});

module.exports = withAndroidPermissionPolicy;
