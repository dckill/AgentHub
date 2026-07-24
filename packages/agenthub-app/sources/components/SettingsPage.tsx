import * as React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ItemList } from '@/components/ItemList';

type SettingsPageProps = {
    title: string;
    children: React.ReactNode;
    listStyle?: StyleProp<ViewStyle>;
    itemScale?: number;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
});

export function SettingsPage({ title, children, listStyle, itemScale }: SettingsPageProps) {
    return (
        <View role="main" style={styles.container}>
            <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                {title}
            </Text>
            <ItemList style={listStyle} itemScale={itemScale}>{children}</ItemList>
        </View>
    );
}
