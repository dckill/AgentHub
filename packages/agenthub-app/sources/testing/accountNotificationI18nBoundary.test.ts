import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en as defaults } from '../text/_default';
import { ca } from '../text/translations/ca';
import { en } from '../text/translations/en';
import { es } from '../text/translations/es';
import { it as itLocale } from '../text/translations/it';
import { ja } from '../text/translations/ja';
import { pl } from '../text/translations/pl';
import { pt } from '../text/translations/pt';
import { ru } from '../text/translations/ru';
import { zhHans } from '../text/translations/zh-Hans';
import { zhHant } from '../text/translations/zh-Hant';

const dictionaries = { defaults, ca, en, es, it: itLocale, ja, pl, pt, ru, zhHans, zhHant };

describe('account notification i18n boundary', () => {
    it('does not present iOS-only permission guidance on Android', () => {
        for (const [locale, dictionary] of Object.entries(dictionaries)) {
            const copy = [
                dictionary.settingsAccount.pushPermSubIOSDenied,
                dictionary.settingsAccount.pushRequestPermSubtitleCanAsk,
                dictionary.settingsAccount.pushRequestPermSubtitleCannotAsk,
            ].join(' ');

            expect(copy, locale).not.toMatch(/\biOS\b/i);
        }
    });

    it('allows the permission guidance to reflow instead of truncating on narrow screens', () => {
        const accountSource = fs.readFileSync(
            path.join(process.cwd(), 'sources/-settings/AccountSettingsView.tsx'),
            'utf8',
        );

        const itemFor = (translationKey: string) => accountSource.match(new RegExp(
            `<Item\\s+(?:(?!<Item)[\\s\\S])*?title=\\{t\\('${translationKey}'\\)\\}(?:(?!<Item)[\\s\\S])*?\\/>`,
        ))?.[0] ?? '';

        for (const key of [
            'settingsAccount.pushPermission',
            'settingsAccount.pushRequestPermission',
            'settingsAccount.pushReregisterDevice',
            'settingsAccount.pushNoTokens',
            'settingsAccount.logout',
        ]) {
            expect(itemFor(key), key).toContain('subtitleLines={0}');
            expect(itemFor(key), key).toContain('titleLines={0}');
        }

        const permissionItem = itemFor('settingsAccount.pushPermission');
        expect(permissionItem).not.toContain('detail={formatPushPermissionLabel');
        expect(permissionItem).toContain('formatPushPermissionLabel(pushPermission)');
        expect(permissionItem).toContain("'\\n'");
    });

    it('places long account identifiers below their labels on narrow screens', () => {
        const accountSource = fs.readFileSync(
            path.join(process.cwd(), 'sources/-settings/AccountSettingsView.tsx'),
            'utf8',
        );
        const itemFor = (translationKey: string) => accountSource.match(new RegExp(
            `<Item\\s+(?:(?!<Item)[\\s\\S])*?title=\\{t\\('${translationKey}'\\)\\}(?:(?!<Item)[\\s\\S])*?\\/>`,
        ))?.[0] ?? '';

        for (const key of ['settingsAccount.anonymousId', 'settingsAccount.publicId']) {
            expect(itemFor(key), key).toContain('subtitle=');
            expect(itemFor(key), key).toContain('subtitleLines={0}');
            expect(itemFor(key), key).not.toContain('detail=');
        }
    });
});
