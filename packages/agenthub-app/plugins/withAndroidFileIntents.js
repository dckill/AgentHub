const { withAndroidManifest } = require('@expo/config-plugins');

const REQUEST_INSTALL_PACKAGES = 'android.permission.REQUEST_INSTALL_PACKAGES';

const QUERY_INTENTS = [
    {
        action: 'android.intent.action.VIEW',
        category: 'android.intent.category.DEFAULT',
        data: { 'android:mimeType': '*/*' },
    },
    {
        action: 'android.intent.action.VIEW',
        category: 'android.intent.category.DEFAULT',
        data: { 'android:mimeType': 'application/vnd.android.package-archive' },
    },
    {
        action: 'android.intent.action.INSTALL_PACKAGE',
        category: 'android.intent.category.DEFAULT',
        data: { 'android:mimeType': 'application/vnd.android.package-archive' },
    },
    {
        action: 'android.intent.action.OPEN_DOCUMENT_TREE',
        category: 'android.intent.category.DEFAULT',
    },
];

function ensureUsesPermission(manifest, name) {
    manifest['uses-permission'] ??= [];
    const exists = manifest['uses-permission'].some((permission) => (
        permission.$?.['android:name'] === name
    ));
    if (!exists) {
        manifest['uses-permission'].push({
            $: {
                'android:name': name,
            },
        });
    }
}

function ensureQueries(manifest) {
    manifest.queries ??= [{}];
    const queries = manifest.queries[0] ?? {};
    queries.intent ??= [];
    manifest.queries[0] = queries;

    for (const queryIntent of QUERY_INTENTS) {
        if (hasMatchingQueryIntent(queries.intent, queryIntent)) {
            continue;
        }
        queries.intent.push(toManifestIntent(queryIntent));
    }
}

function hasMatchingQueryIntent(intents, queryIntent) {
    return intents.some((intent) => {
        const hasAction = intent.action?.some((action) => (
            action.$?.['android:name'] === queryIntent.action
        ));
        if (!hasAction) {
            return false;
        }
        const expectedData = queryIntent.data;
        if (!expectedData) {
            return true;
        }
        return intent.data?.some((data) => Object.entries(expectedData).every(([key, value]) => (
            data.$?.[key] === value
        )));
    });
}

function toManifestIntent(queryIntent) {
    const intent = {
        action: [
            {
                $: {
                    'android:name': queryIntent.action,
                },
            },
        ],
    };
    if (queryIntent.category) {
        intent.category = [
            {
                $: {
                    'android:name': queryIntent.category,
                },
            },
        ];
    }
    if (queryIntent.data) {
        intent.data = [
            {
                $: queryIntent.data,
            },
        ];
    }
    return intent;
}

const withAndroidFileIntents = (config) => withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    ensureUsesPermission(manifest, REQUEST_INSTALL_PACKAGES);
    ensureQueries(manifest);
    return manifestConfig;
});

module.exports = withAndroidFileIntents;
