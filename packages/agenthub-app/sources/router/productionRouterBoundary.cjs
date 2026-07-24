'use strict';

function shouldUseProductionRouterContext(appEnv) {
    return appEnv !== 'development' && appEnv !== 'preview';
}

module.exports = { shouldUseProductionRouterContext };
