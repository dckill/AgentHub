import * as React from 'react';
import {
    View,
    Text,
    StyleProp,
    ViewStyle,
    TextStyle,
    Platform
} from 'react-native';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useItemScale } from '@/components/ItemScaleContext';
import { GlassSurface } from '@/components/glass';

interface ItemChildProps {
    showDivider?: boolean;
    [key: string]: any;
}

export interface ItemGroupProps {
    title?: string | React.ReactNode;
    footer?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    headerStyle?: StyleProp<ViewStyle>;
    footerStyle?: StyleProp<ViewStyle>;
    titleStyle?: StyleProp<TextStyle>;
    footerTextStyle?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme, runtime) => ({
    wrapper: {
        alignItems: 'center',
    },
    container: {
        width: '100%',
        maxWidth: layout.maxWidth,
        paddingHorizontal: Platform.select({ ios: 0, default: 4 }),
    },
    header: {
        paddingTop: Platform.select({ ios: 35, default: 16 }),
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
    },
    headerNoTitle: {
        paddingTop: Platform.select({ ios: 20, default: 16 }),
    },
    headerText: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 13, default: 14 }),
        lineHeight: Platform.select({ ios: 18, default: 20 }),
        letterSpacing: Platform.select({ ios: -0.08, default: 0.1 }),
        textTransform: 'uppercase',
        fontWeight: Platform.select({ ios: 'normal', default: '500' }),
    },
    contentContainer: {
        marginHorizontal: Platform.select({ ios: 16, default: 12 }),
        borderRadius: Platform.select({ ios: 10, default: 16 }),
    },
    footer: {
        paddingTop: Platform.select({ ios: 6, default: 8 }),
        paddingBottom: Platform.select({ ios: 8, default: 16 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
    },
    footerText: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 13, default: 14 }),
        lineHeight: Platform.select({ ios: 18, default: 20 }),
        letterSpacing: Platform.select({ ios: -0.08, default: 0 }),
    },
}));

export const ItemGroup = React.memo<ItemGroupProps>((props) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const s = useItemScale();

    const {
        title,
        footer,
        children,
        style,
        headerStyle,
        footerStyle,
        titleStyle,
        footerTextStyle,
        containerStyle
    } = props;

    return (
        <View style={[styles.wrapper, style]}>
            <View style={styles.container}>
                {/* Header */}
                {title ? (
                    <View style={[
                        styles.header,
                        {
                            paddingTop: Platform.select({ ios: s(35), default: s(16) }),
                            paddingBottom: Platform.select({ ios: s(6), default: s(8) }),
                            paddingHorizontal: Platform.select({ ios: s(32), default: s(24) }),
                        },
                        headerStyle
                    ]}>
                        {typeof title === 'string' ? (
                            <Text style={[
                                styles.headerText,
                                {
                                    fontSize: Platform.select({ ios: s(13), default: s(14) }),
                                    lineHeight: Platform.select({ ios: s(18), default: s(20) }),
                                },
                                titleStyle
                            ]}>
                                {title}
                            </Text>
                        ) : (
                            title
                        )}
                    </View>
                ) : (
                    // Add top margin when there's no title
                    <View style={[styles.headerNoTitle, { paddingTop: Platform.select({ ios: s(20), default: s(16) }) }]} />
                )}

                {/* Content Container */}
                <GlassSurface tone="raised" style={[
                    styles.contentContainer,
                    {
                        marginHorizontal: Platform.select({ ios: s(16), default: s(12) }),
                        borderRadius: Platform.select({ ios: s(10), default: s(16) }),
                    },
                    containerStyle
                ]}>
                    {React.Children.map(children, (child, index) => {
                        if (React.isValidElement<ItemChildProps>(child)) {
                            // Don't add props to React.Fragment
                            if (child.type === React.Fragment) {
                                return child;
                            }
                            const isLast = index === React.Children.count(children) - 1;
                            const childProps = child.props as ItemChildProps;
                            return React.cloneElement(child, {
                                ...childProps,
                                showDivider: !isLast && childProps.showDivider !== false
                            });
                        }
                        return child;
                    })}
                </GlassSurface>

                {/* Footer */}
                {footer && (
                    <View style={[
                        styles.footer,
                        {
                            paddingTop: Platform.select({ ios: s(6), default: s(8) }),
                            paddingBottom: Platform.select({ ios: s(8), default: s(16) }),
                            paddingHorizontal: Platform.select({ ios: s(32), default: s(24) }),
                        },
                        footerStyle
                    ]}>
                        <Text style={[
                            styles.footerText,
                            {
                                fontSize: Platform.select({ ios: s(13), default: s(14) }),
                                lineHeight: Platform.select({ ios: s(18), default: s(20) }),
                            },
                            footerTextStyle
                        ]}>
                            {footer}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
});
