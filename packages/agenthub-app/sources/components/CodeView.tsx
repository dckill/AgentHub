import * as React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { getCodeBlockVisuals } from './codeSurfaceVisuals';
import { SimpleSyntaxHighlighter } from './SimpleSyntaxHighlighter';
import { HorizontalScrollView } from './HorizontalScrollView';
import { useChatScale } from '@/hooks/useScale';
import { Typography } from '@/constants/Typography';

interface CodeViewProps {
    code: string;
    language?: string;
    showLineNumbers?: boolean;
    scaleMultiplier?: number;
    accessibilityLabel?: string;
}

export const CodeView = React.memo<CodeViewProps>(({ 
    code, 
    language,
    showLineNumbers = true,
    scaleMultiplier,
    accessibilityLabel,
}) => {
    const { theme } = useUnistyles();
    const { scale: chatScale } = useChatScale();
    const visuals = getCodeBlockVisuals(theme);
    const effectiveScale = scaleMultiplier ?? chatScale;

    return (
        <View style={[styles.codeBlock, { backgroundColor: visuals.backgroundColor, borderColor: visuals.borderColor }]}>
            {!!language && (
                <View style={[styles.header, { backgroundColor: visuals.headerBackgroundColor, borderBottomColor: visuals.headerBorderColor }]}>
                    <Text style={[styles.language, { color: visuals.languageColor }]} numberOfLines={1}>
                        {language}
                    </Text>
                </View>
            )}
            <HorizontalScrollView contentContainerStyle={styles.scrollContent}>
                <SimpleSyntaxHighlighter
                    code={code}
                    language={language ?? null}
                    selectable
                    showLineNumbers={showLineNumbers}
                    scaleMultiplier={effectiveScale}
                    virtualized={false}
                    surface={theme.dark ? 'terminal' : 'default'}
                    accessibilityLabel={accessibilityLabel}
                />
            </HorizontalScrollView>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderColor: theme.colors.glass.border,
        borderRadius: 8,
        borderWidth: 1,
        overflow: 'hidden',
    },
    header: {
        minHeight: 34,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        justifyContent: 'center',
    },
    language: {
        ...Typography.mono(),
        fontSize: 11,
        lineHeight: 14,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    scrollContent: {
        paddingVertical: 10,
    },
}));
