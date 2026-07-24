import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { useUnistyles } from 'react-native-unistyles';
import { useUpdates } from '@/hooks/useUpdates';
import { useChangelog } from '@/hooks/useChangelog';
import { useNativeUpdate } from '@/hooks/useNativeUpdate';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Platform } from 'react-native';
import { t } from '@/text';

export const UpdateBanner = React.memo(() => {
    const { theme } = useUnistyles();
    const { updateAvailable, isDownloading, updateStatus, reloadApp } = useUpdates();
    const { hasUnread, markAsRead } = useChangelog();
    const updateUrl = useNativeUpdate();
    const router = useRouter();

    // Show native app update banner (highest priority)
    if (updateUrl) {
        const handleOpenStore = async () => {
            try {
                const supported = await Linking.canOpenURL(updateUrl);
                if (supported) {
                    await Linking.openURL(updateUrl);
                }
            } catch (error) {
                console.error('Error opening app store:', error);
            }
        };

        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.nativeUpdateAvailable')}
                    subtitle={Platform.OS === 'ios' ? t('updateBanner.tapToUpdateAppStore') : t('updateBanner.tapToUpdatePlayStore')}
                    icon={<Ionicons name="download-outline" size={28} color={theme.colors.success} />}
                    showChevron={true}
                    onPress={handleOpenStore}
                />
            </ItemGroup>
        );
    }

    if (isDownloading || updateStatus === 'downloading') {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.downloadingUpdate')}
                    subtitle={t('updateBanner.downloadingUpdateSubtitle')}
                    icon={<ActivityIndicator size="small" color={theme.colors.textSecondary} />}
                    showChevron={false}
                />
            </ItemGroup>
        );
    }

    // Show OTA update banner if available (second priority)
    if (updateAvailable) {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.updateReady')}
                    subtitle={t('updateBanner.restartToApply')}
                    icon={<Ionicons name={updateStatus === 'restarting' ? 'refresh-outline' : 'cloud-done-outline'} size={28} color={theme.colors.success} />}
                    showChevron={false}
                    onPress={reloadApp}
                    loading={updateStatus === 'restarting'}
                />
            </ItemGroup>
        );
    }

    // Show changelog banner if there are unread changelog entries (lowest priority)
    if (hasUnread) {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.whatsNew')}
                    subtitle={t('updateBanner.seeLatest')}
                    icon={<Ionicons name="sparkles-outline" size={28} color={theme.colors.text} />}
                    showChevron={true}
                    onPress={() => {
                        router.push('/changelog');
                        setTimeout(() => {
                            markAsRead();
                        }, 1000);
                    }}
                />
            </ItemGroup>
        );
    }

    return null;
});
