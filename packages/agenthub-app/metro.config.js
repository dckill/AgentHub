const { getDefaultConfig } = require("expo/metro-config");
const path = require('node:path');
const { shouldUseProductionRouterContext } = require('./sources/router/productionRouterBoundary.cjs');

const config = getDefaultConfig(__dirname, {
  // Enable CSS support for web
  isCSSEnabled: true,
});

// Add support for .wasm files (required by Skia for all platforms)
// Source: https://shopify.github.io/react-native-skia/docs/getting-started/installation/
config.resolver.assetExts.push('wasm');
config.resolver.assetExts.push('mermaidjs');

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web'
    && moduleName.endsWith('vendor/react-native-vector-icons/Fonts/Ionicons.ttf')
  ) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'sources/assets/fonts/IoniconsSubset.ttf'),
      platform,
    );
  }
  if (
    moduleName === 'expo-router/_ctx'
    && shouldUseProductionRouterContext(process.env.APP_ENV)
  ) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'sources/router/productionRouterContext.js'),
      platform,
    );
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Enable inlineRequires for proper Skia and Reanimated loading
// Source: https://shopify.github.io/react-native-skia/docs/getting-started/web/
// Without this, Skia throws "react-native-reanimated is not installed" error
// This is cross-platform compatible (iOS, Android, web)
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true, // Critical for @shopify/react-native-skia
  },
});

module.exports = config;
