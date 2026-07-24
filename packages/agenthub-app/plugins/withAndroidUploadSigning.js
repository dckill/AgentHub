const { withAppBuildGradle } = require('@expo/config-plugins');

const SIGNING_CONFIG = `        agenthubUpload {
            def uploadStoreFile = findProperty('agenthubUploadStoreFile')
            def uploadStorePassword = findProperty('agenthubUploadStorePassword')
            def uploadKeyAlias = findProperty('agenthubUploadKeyAlias')
            def uploadKeyPassword = findProperty('agenthubUploadKeyPassword')
            if (uploadStoreFile && uploadStorePassword && uploadKeyAlias && uploadKeyPassword) {
                storeFile file(uploadStoreFile)
                storePassword uploadStorePassword
                keyAlias uploadKeyAlias
                keyPassword uploadKeyPassword
            }
        }`;

const RELEASE_SIGNING = `            def hasAgentHubUploadSigning = findProperty('agenthubUploadStoreFile') &&
                findProperty('agenthubUploadStorePassword') &&
                findProperty('agenthubUploadKeyAlias') &&
                findProperty('agenthubUploadKeyPassword')
            if (!hasAgentHubUploadSigning) {
                throw new GradleException('Missing AgentHub Android upload signing properties. Set agenthubUploadStoreFile, agenthubUploadStorePassword, agenthubUploadKeyAlias, and agenthubUploadKeyPassword.')
            }
            signingConfig signingConfigs.agenthubUpload`;

function addUploadSigningConfig(contents) {
    if (contents.includes('agenthubUpload {')) {
        return contents;
    }

    return contents.replace(
        /(signingConfigs\s*\{\n(?:.|\n)*?debug\s*\{(?:.|\n)*?\n\s*\}\n)/,
        `$1${SIGNING_CONFIG}\n`
    );
}

function useUploadSigningForRelease(contents) {
    return contents.replace(
        /release\s*\{\n\s*\/\/ Caution![^\n]*\n\s*\/\/ see [^\n]*\n\s*signingConfig signingConfigs\.debug/,
        `release {\n${RELEASE_SIGNING}`
    );
}

const withAndroidUploadSigning = (config) => withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
        throw new Error('withAndroidUploadSigning only supports Groovy build.gradle files.');
    }

    gradleConfig.modResults.contents = useUploadSigningForRelease(
        addUploadSigningConfig(gradleConfig.modResults.contents)
    );
    return gradleConfig;
});

module.exports = withAndroidUploadSigning;
