import * as React from 'react';
import { View, Platform, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { randomUUID } from 'expo-crypto';
import {
    buildMermaidWebViewHtml,
    parseMermaidWebFrameMessage,
    parseMermaidWebViewMessage,
    shouldAllowMermaidNavigation,
} from './mermaidWebViewSecurity';
import { loadBundledMermaidScript } from './mermaidNativeAsset';

// Mermaid render component that works on all platforms
export const MermaidRenderer = React.memo((props: {
    content: string;
}) => {
    const { theme } = useUnistyles();
    const [dimensions, setDimensions] = React.useState({ width: 0, height: 200 });
    const [mermaidScript, setMermaidScript] = React.useState<string | null>(null);
    const [loadError, setLoadError] = React.useState(false);
    const webFrameRef = React.useRef<HTMLIFrameElement | null>(null);
    const securityTokens = React.useRef({
        bridgeToken: randomUUID(),
        scriptNonce: randomUUID().replace(/-/g, ''),
    }).current;
    React.useEffect(() => {
        let active = true;
        loadBundledMermaidScript()
            .then((script) => {
                if (active) setMermaidScript(script);
            })
            .catch((error) => {
                if (active) {
                    console.warn(`[Mermaid] ${t('markdown.mermaidRenderFailed')}: ${error instanceof Error ? error.message : String(error)}`);
                    setLoadError(true);
                }
            });
        return () => { active = false; };
    }, []);

    const html = React.useMemo(() => mermaidScript ? buildMermaidWebViewHtml({
        content: props.content,
        backgroundColor: theme.colors.surfaceHighest,
        bridgeToken: securityTokens.bridgeToken,
        scriptNonce: securityTokens.scriptNonce,
        mermaidScript,
    }) : null, [mermaidScript, props.content, securityTokens.bridgeToken, securityTokens.scriptNonce, theme.colors.surfaceHighest]);

    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        const onMessage = (event: MessageEvent) => {
            const data = parseMermaidWebFrameMessage(
                event,
                webFrameRef.current?.contentWindow,
                securityTokens.bridgeToken,
            );
            if (data) setDimensions((previous) => ({ ...previous, height: data.height }));
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [securityTokens.bridgeToken]);

    const onLayout = React.useCallback((event: any) => {
        const { width } = event.nativeEvent.layout;
        setDimensions(prev => ({ ...prev, width }));
    }, []);

    if (Platform.OS === 'web') {
        if (loadError) {
            return (
                <View style={[style.container, style.errorContainer]}>
                    <Text style={style.errorText}>{t('markdown.mermaidRenderFailed')}</Text>
                </View>
            );
        }
        if (!html) {
            return (
                <View style={[style.container, style.loadingContainer]}>
                    <View style={style.loadingPlaceholder} />
                </View>
            );
        }

        return (
            <View style={style.container}>
                <iframe
                    ref={webFrameRef}
                    title={t('components.mermaid.diagramLabel')}
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    srcDoc={html}
                    style={{
                        width: '100%',
                        height: dimensions.height,
                        border: 0,
                        borderRadius: 8,
                        backgroundColor: theme.colors.surfaceHighest,
                    }}
                />
            </View>
        );
    }

    if (loadError) {
        return (
            <View style={[style.container, style.errorContainer]}>
                <Text style={style.errorText}>{t('markdown.mermaidRenderFailed')}</Text>
            </View>
        );
    }

    if (!html) {
        return (
            <View style={[style.container, style.loadingContainer]}>
                <View style={style.loadingPlaceholder} />
            </View>
        );
    }

    return (
        <View style={style.container} onLayout={onLayout}>
            <View style={[style.innerContainer, { height: dimensions.height }]}>
                <WebView
                    source={{ html }}
                    style={{ flex: 1 }}
                    scrollEnabled={false}
                    originWhitelist={['about:blank']}
                    javaScriptEnabled={true}
                    domStorageEnabled={false}
                    thirdPartyCookiesEnabled={false}
                    sharedCookiesEnabled={false}
                    javaScriptCanOpenWindowsAutomatically={false}
                    setSupportMultipleWindows={false}
                    allowFileAccess={false}
                    allowFileAccessFromFileURLs={false}
                    allowUniversalAccessFromFileURLs={false}
                    mixedContentMode="never"
                    onShouldStartLoadWithRequest={(request) => shouldAllowMermaidNavigation(request.url)}
                    onMessage={(event) => {
                        const data = parseMermaidWebViewMessage(event.nativeEvent.data, securityTokens.bridgeToken);
                        if (data) {
                            setDimensions(prev => ({
                                ...prev,
                                height: Math.max(prev.height, data.height)
                            }));
                        }
                    }}
                />
            </View>
        </View>
    );
});

const style = StyleSheet.create((theme) => ({
    container: {
        marginVertical: 8,
        width: '100%',
    },
    innerContainer: {
        width: '100%',
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        height: 100,
    },
    loadingPlaceholder: {
        width: 200,
        height: 20,
        backgroundColor: theme.colors.divider,
        borderRadius: 4,
    },
    errorContainer: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
        padding: 16,
    },
    errorContent: {
        flexDirection: 'column',
        gap: 12,
    },
    errorText: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 16,
    },
    codeBlock: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 4,
        padding: 12,
    },
    codeText: {
        ...Typography.mono(),
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
}));
