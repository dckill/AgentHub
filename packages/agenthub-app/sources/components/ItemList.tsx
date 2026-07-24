import * as React from 'react';
import { 
    ScrollView, 
    View, 
    StyleProp, 
    ViewStyle,
    Platform,
    ScrollViewProps
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useListScale } from '@/hooks/useScale';
import { ItemScaleProvider } from '@/components/ItemScaleContext';

export interface ItemListProps extends ScrollViewProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    insetGrouped?: boolean;
    itemScale?: number;
}

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        paddingBottom: Platform.select({ ios: 34, default: 16 }),
        paddingTop: 0,
    },
}));

export const ItemList = React.memo<ItemListProps>((props) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { scale: listScale } = useListScale();
    
    const {
        children,
        style,
        containerStyle,
        insetGrouped = true,
        itemScale,
        ...scrollViewProps
    } = props;

    const isIOS = Platform.OS === 'ios';
    const isWeb = Platform.OS === 'web';
    
    // Override background for non-inset grouped lists on iOS
    const backgroundColor = (isIOS && !insetGrouped) ? theme.colors.canvas : theme.colors.groupped.background;
    const resolvedItemScale = itemScale ?? listScale;

    return (
        <ItemScaleProvider scale={resolvedItemScale}>
            <ScrollView
                style={[
                    styles.container,
                    { backgroundColor },
                    style
                ]}
                contentContainerStyle={[
                    styles.contentContainer,
                    containerStyle
                ]}
                showsVerticalScrollIndicator={scrollViewProps.showsVerticalScrollIndicator !== undefined
                    ? scrollViewProps.showsVerticalScrollIndicator
                    : true}
                contentInsetAdjustmentBehavior={(isIOS && !isWeb) ? 'automatic' : undefined}
                {...scrollViewProps}
            >
                {children}
            </ScrollView>
        </ItemScaleProvider>
    );
});

export const ItemListStatic = React.memo<Omit<ItemListProps, keyof ScrollViewProps> & {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    insetGrouped?: boolean;
    itemScale?: number;
}>((props) => {
    const { theme } = useUnistyles();
    const { scale: listScale } = useListScale();
    
    const {
        children,
        style,
        containerStyle,
        insetGrouped = true,
        itemScale,
    } = props;

    const isIOS = Platform.OS === 'ios';
    
    // Override background for non-inset grouped lists on iOS
    const backgroundColor = (isIOS && !insetGrouped) ? theme.colors.canvas : theme.colors.groupped.background;
    const resolvedItemScale = itemScale ?? listScale;

    return (
        <ItemScaleProvider scale={resolvedItemScale}>
            <View
                style={[
                    { backgroundColor },
                    style
                ]}
            >
                <View style={containerStyle}>
                    {children}
                </View>
            </View>
        </ItemScaleProvider>
    );
});
