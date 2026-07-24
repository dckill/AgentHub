import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { CodeView } from '@/components/CodeView';
import { CommandView } from '@/components/CommandView';
import { CodexPatchView } from '@/components/tools/views/CodexPatchView';
import type { ToolCall } from '@/sync/typesMessage';
import { MermaidRenderer } from '@/components/markdown/MermaidRenderer';
import { getMermaidQaCases } from '@/dev/mermaidQaCases';

const patchTool: ToolCall = {
    name: 'CodexPatch',
    state: 'completed',
    input: {
        changes: {
            'packages/agenthub-app/sources/components/Button.tsx': {
                kind: { type: 'update' },
                diff: `diff --git a/packages/agenthub-app/sources/components/Button.tsx b/packages/agenthub-app/sources/components/Button.tsx
--- a/packages/agenthub-app/sources/components/Button.tsx
+++ b/packages/agenthub-app/sources/components/Button.tsx
@@ -1,6 +1,6 @@
-const tone = "neutral";
+const tone = "agenthub";
 const styles = StyleSheet.create((theme) => ({
   container: {
-    borderColor: theme.colors.divider,
+    borderColor: theme.colors.glass.border,
   },
 }));
`,
            },
        },
    },
    createdAt: Date.now() - 9000,
    startedAt: Date.now() - 8500,
    completedAt: Date.now() - 7000,
    description: 'Preview AgentHub diff surface',
    result: 'Patch applied',
};

export default function CodeSurfacesScreen() {
    const mermaidCases = getMermaidQaCases();
    return (
        <>
            <Stack.Screen options={{ headerTitle: 'Code Surfaces' }} />
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                <Text style={styles.title}>Code and Diff Surfaces</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Code block</Text>
                    <CodeView
                        language="typescript"
                        code={`export function getAgentHubSurface() {
  return {
    tone: 'amber-crystal',
    elevated: true,
  };
}`}
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Terminal output</Text>
                    <CommandView
                        command="pnpm check"
                        stdout={`format:check passed
typecheck passed
guardrails passed`}
                        stderr={null}
                        error={null}
                        fullWidth
                    />
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Codex patch diff</Text>
                    <CodexPatchView tool={patchTool} metadata={null} />
                </View>

                {mermaidCases.map(mermaidCase => (
                    <View key={mermaidCase.id} style={styles.section}>
                        <Text style={styles.sectionTitle}>{mermaidCase.title}</Text>
                        <MermaidRenderer content={mermaidCase.content} />
                    </View>
                ))}
            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.canvas,
    },
    content: {
        alignSelf: 'center',
        gap: 22,
        maxWidth: 900,
        paddingHorizontal: 24,
        paddingVertical: 28,
        width: '100%',
    },
    title: {
        color: theme.colors.text,
        fontSize: 26,
        fontWeight: '700',
    },
    section: {
        gap: 10,
    },
    sectionTitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
}));
