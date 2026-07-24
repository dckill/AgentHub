export const ctx = require.context(
    '../app',
    true,
    /^(?:\.\/)(?!.*\/dev\/)(?!(?:(?:(?:.*\+api)|(?:\+html)))\.[tj]sx?$).*\.[tj]sx?$/,
);
