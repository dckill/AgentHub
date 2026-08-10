import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { z } from 'zod';
import type { ToolViewProps } from './_all';
import { useAttachmentImage } from '@/hooks/useAttachmentImage';
import { t } from '@/text';

const fileInputSchema = z.object({
    ref: z.string(),
    name: z.string(),
    mimeType: z.string().optional(),
    image: z.object({ width: z.number(), height: z.number() }).optional(),
});

export const FileView = React.memo<ToolViewProps>(({ tool, sessionId }) => {
    const { theme } = useUnistyles();
    const parsed = fileInputSchema.safeParse(tool.input);
    if (!parsed.success) return null;
    const { ref, name, image } = parsed.data;
    const { uri, loading, error } = useAttachmentImage(sessionId ?? '', sessionId ? ref : undefined);
    const aspectRatio = image && image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3;

    return (
        <View style={styles.container} accessibilityLabel={t('common.attachmentAccessibilityLabel', { name })}>
            <View style={[styles.preview, { borderColor: theme.colors.divider, aspectRatio }]}>
                {uri ? <Image source={{ uri }} style={styles.image} contentFit="cover" transition={150} /> : null}
                {loading ? <ActivityIndicator color={theme.colors.textSecondary} /> : null}
                {error ? <Ionicons name="alert-circle-outline" size={24} color={theme.colors.textSecondary} /> : null}
            </View>
            <Text style={[styles.name, { color: theme.colors.textSecondary }]} numberOfLines={1}>{name}</Text>
        </View>
    );
});

const styles = StyleSheet.create(() => ({
    container: { gap: 6, paddingBottom: 8 },
    preview: {
        width: '100%',
        maxWidth: 280,
        maxHeight: 360,
        minHeight: 120,
        borderWidth: 1,
        borderRadius: 10,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: { width: '100%', height: '100%' },
    name: { maxWidth: 280, fontSize: 13, fontWeight: '500' },
}));
