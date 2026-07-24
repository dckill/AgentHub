import * as React from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, TextStyle } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { getGlassTextFieldColors } from './glassStyles';

export interface GlassTextFieldProps extends TextInputProps {
    error?: boolean;
    inputStyle?: StyleProp<TextStyle>;
}

const stylesheet = StyleSheet.create({
    input: {
        width: '100%',
        minHeight: 42,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 15,
        lineHeight: 20,
        ...Typography.default(),
    },
});

export const GlassTextField = React.forwardRef<TextInput, GlassTextFieldProps>((props, ref) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { error, inputStyle, onFocus, onBlur, ...rest } = props;
    const [focused, setFocused] = React.useState(false);
    const colors = getGlassTextFieldColors(theme, focused, error);

    return (
        <TextInput
            {...rest}
            ref={ref}
            style={[
                styles.input,
                {
                    backgroundColor: colors.backgroundColor,
                    borderColor: colors.borderColor,
                    color: colors.textColor,
                },
                inputStyle,
            ]}
            placeholderTextColor={props.placeholderTextColor ?? colors.placeholderColor}
            onFocus={(event) => {
                setFocused(true);
                onFocus?.(event);
            }}
            onBlur={(event) => {
                setFocused(false);
                onBlur?.(event);
            }}
        />
    );
});
