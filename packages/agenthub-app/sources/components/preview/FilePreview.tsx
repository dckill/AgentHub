import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useFileScale } from '@/hooks/useScale';

const SAMPLE_JSON = `{
  "app": {
    "name": "remote-session",
    "language": "auto",
    "theme": "system"
  },
  "session": {
    "defaultDirectory": "~/projects/mobile-client",
    "autoSaveDrafts": true,
    "showLineNumbers": true,
    "strict": true,
    "maxSuggestions": 3
  }
}`;

export const FilePreview = React.memo(() => {
    const { theme } = useUnistyles();
    const { s } = useFileScale();
    const lines = SAMPLE_JSON.split('\n');

    // Simple manual syntax coloring for JSON
    const colorizeLine = (line: string) => {
        const parts: { text: string; color: string; fontWeight?: string }[] = [];
        // Match strings (keys and values), numbers, booleans
        const regex = /("(?:[^"\\]|\\.)*")\s*(:?)|(\b(?:true|false|null)\b)|(-?\d+\.?\d*)|([{}[\],])/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null) {
            // Add any text before this match
            if (match.index > lastIndex) {
                parts.push({ text: line.slice(lastIndex, match.index), color: theme.colors.syntaxDefault });
            }
            if (match[1]) {
                // String
                if (match[2] === ':') {
                    // Key
                    parts.push({ text: match[1], color: theme.colors.syntaxFunction });
                    parts.push({ text: match[2], color: theme.colors.syntaxDefault });
                } else {
                    // Value
                    parts.push({ text: match[1], color: theme.colors.syntaxString });
                }
            } else if (match[3]) {
                // Boolean
                parts.push({ text: match[3], color: theme.colors.syntaxNumber });
            } else if (match[4]) {
                // Number
                parts.push({ text: match[4], color: theme.colors.syntaxNumber });
            } else if (match[5]) {
                // Bracket
                parts.push({ text: match[5], color: theme.colors.syntaxDefault });
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < line.length) {
            parts.push({ text: line.slice(lastIndex), color: theme.colors.syntaxDefault });
        }
        return parts;
    };

    return (
        <View style={styles.container}>
            {/* File path header */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: s(16),
                paddingVertical: s(8),
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.colors.divider,
            }}>
                <Ionicons name="document-text-outline" size={s(16)} color={theme.colors.textSecondary} />
                <Text style={{
                    ...Typography.mono(),
                    fontSize: s(14),
                    color: theme.colors.text,
                    marginLeft: s(8),
                    flex: 1,
                }} numberOfLines={1}>
                    config/session.json
                </Text>
                <View style={{
                    backgroundColor: theme.colors.surfaceHigh,
                    paddingHorizontal: s(8),
                    paddingVertical: s(2),
                    borderRadius: s(4),
                }}>
                    <Text style={{
                        ...Typography.mono(),
                        fontSize: s(12),
                        color: theme.colors.textSecondary,
                    }}>JSON</Text>
                </View>
            </View>

            {/* Code content with line numbers */}
            <View style={{ flexDirection: 'column' }}>
                {lines.map((line, index) => {
                    const parts = colorizeLine(line);
                    return (
                        <View key={index} style={{ flexDirection: 'row', minHeight: s(20) }}>
                            {/* Line number */}
                            <View style={{
                                width: s(50),
                                alignItems: 'flex-end',
                                paddingRight: s(12),
                                backgroundColor: theme.colors.diff.lineNumberBg,
                            }}>
                                <Text style={{
                                    ...Typography.mono(),
                                    fontSize: s(14),
                                    lineHeight: s(20),
                                    color: theme.colors.diff.lineNumberText,
                                }}>
                                    {index + 1}
                                </Text>
                            </View>
                            {/* Code */}
                            <Text style={{
                                ...Typography.mono(),
                                fontSize: s(14),
                                lineHeight: s(20),
                                flex: 1,
                                color: theme.colors.syntaxDefault,
                            }}>
                                {parts.map((part, i) => (
                                    <Text
                                        key={i}
                                        style={{
                                            color: part.color,
                                            fontFamily: Typography.mono().fontFamily,
                                            fontWeight: part.fontWeight as any,
                                        }}
                                    >
                                        {part.text}
                                    </Text>
                                ))}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        overflow: 'hidden',
        marginHorizontal: 12,
    },
}));
