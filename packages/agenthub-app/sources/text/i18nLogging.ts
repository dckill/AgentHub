type I18nLoggingEnv = Record<string, string | undefined>;

export function shouldLogI18n(env: I18nLoggingEnv = process.env): boolean {
    return env.EXPO_PUBLIC_AGENTHUB_I18N_DEBUG === '1';
}
