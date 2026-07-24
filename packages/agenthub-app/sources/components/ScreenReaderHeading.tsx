import * as React from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

const styles = StyleSheet.create({
    heading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
});

export function ScreenReaderHeading({ title }: { title: string }) {
    return (
        <Text role="heading" aria-level={1} style={styles.heading}>
            {title}
        </Text>
    );
}
