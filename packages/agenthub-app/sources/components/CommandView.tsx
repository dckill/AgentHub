import * as React from 'react';
import { ScrollView, Text, View, StyleSheet, Platform } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useChatScale } from '@/hooks/useScale';
import { useSetting } from '@/sync/storage';
import { getTerminalSurfaceVisuals } from './codeSurfaceVisuals';

interface CommandViewProps {
    command: string;
    prompt?: string;
    stdout?: string | null;
    stderr?: string | null;
    error?: string | null;
    // Legacy prop for backward compatibility
    output?: string | null;
    maxHeight?: number;
    fullWidth?: boolean;
    hideEmptyOutput?: boolean;
}

export const CommandView = React.memo<CommandViewProps>(({
    command,
    prompt = '$',
    stdout,
    stderr,
    error,
    output,
    maxHeight,
    fullWidth,
    hideEmptyOutput,
}) => {
    const { theme } = useUnistyles();
    const { s } = useChatScale();
    const terminalVisuals = getTerminalSurfaceVisuals(theme);
    const wrapLines = useSetting('wrapLinesInDiffs');
    // Use legacy output if new props aren't provided
    const hasNewProps = stdout !== undefined || stderr !== undefined || error !== undefined;

    const styles = StyleSheet.create({
        container: {
            backgroundColor: terminalVisuals.backgroundColor,
            borderColor: terminalVisuals.borderColor,
            borderRadius: 10,
            borderWidth: 1,
            overflow: 'hidden',
            padding: 16,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
        },
        contentInner: {
            minWidth: '100%',
        },
        line: {
            alignItems: 'baseline',
            flexDirection: 'row',
            flexWrap: wrapLines ? 'wrap' : 'nowrap',
        },
        promptText: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(14),
            lineHeight: s(20),
            color: terminalVisuals.promptColor,
            fontWeight: '600',
        },
        commandText: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(14),
            color: terminalVisuals.commandColor,
            lineHeight: s(20),
            flex: wrapLines ? 1 : undefined,
        },
        outputLabel: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(11),
            color: theme.colors.terminal.emptyOutput,
            lineHeight: s(16),
            marginTop: s(10),
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            fontWeight: '600',
        },
        stdout: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(13),
            color: theme.colors.terminal.stdout,
            lineHeight: s(18),
            marginTop: s(3),
        },
        stderr: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(13),
            color: theme.colors.terminal.stderr,
            lineHeight: s(18),
            marginTop: s(3),
        },
        error: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(13),
            color: theme.colors.terminal.error,
            lineHeight: s(18),
            marginTop: s(3),
        },
        emptyOutput: {
            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
            fontSize: s(13),
            color: theme.colors.terminal.emptyOutput,
            lineHeight: s(18),
            marginTop: s(8),
            fontStyle: 'italic',
        },
    });

    const content = (
        <View style={styles.contentInner}>
            {/* Command Line */}
            <View style={styles.line}>
                <Text style={styles.promptText}>{prompt} </Text>
                <Text style={styles.commandText}>{command}</Text>
            </View>

            {hasNewProps ? (
                <>
                    {/* Standard Output */}
                    {stdout && stdout.trim() && (
                        <>
                            <Text style={styles.outputLabel}>{t('toolView.output')}</Text>
                            <Text style={styles.stdout}>{stdout}</Text>
                        </>
                    )}

                    {/* Standard Error */}
                    {stderr && stderr.trim() && (
                        <>
                            <Text style={styles.outputLabel}>stderr</Text>
                            <Text style={styles.stderr}>{stderr}</Text>
                        </>
                    )}

                    {/* Error Message */}
                    {error && (
                        <>
                            <Text style={styles.outputLabel}>{t('tools.fullView.error')}</Text>
                            <Text style={styles.error}>{error}</Text>
                        </>
                    )}

                    {/* Empty output indicator */}
                    {!stdout && !stderr && !error && !hideEmptyOutput && (
                        <Text style={styles.emptyOutput}>{t('session.noCommandOutput')}</Text>
                    )}
                </>
            ) : (
                /* Legacy output format */
                output && (
                    <Text style={styles.commandText}>{'\n---\n' + output}</Text>
                )
            )}
        </View>
    );

    return (
        <View style={[
            styles.container,
            maxHeight ? { maxHeight } : undefined,
            fullWidth ? { width: '100%' } : undefined
        ]}>
            {wrapLines ? content : (
                <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                    {content}
                </ScrollView>
            )}
        </View>
    );
});
