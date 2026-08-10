import * as React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { MultiTextInput, type KeyPressEvent, type MultiTextInputHandle, type TextInputState } from './MultiTextInput';

type AgentInputTextFieldProps = {
    inputRef: React.RefObject<MultiTextInputHandle | null>;
    inputContainerStyle: StyleProp<ViewStyle>;
    value: string;
    minHeight?: number;
    textColor: string;
    placeholderTextColor: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    onKeyPress: (event: KeyPressEvent) => boolean;
    onStateChange: (state: TextInputState) => void;
};

export function AgentInputTextField(props: AgentInputTextFieldProps) {
    return (
        <View style={[props.inputContainerStyle, props.minHeight ? { minHeight: props.minHeight } : undefined]}>
            <MultiTextInput
                ref={props.inputRef}
                value={props.value}
                paddingTop={Platform.OS === 'web' ? 11 : 8}
                paddingBottom={Platform.OS === 'web' ? 11 : 8}
                textColor={props.textColor}
                placeholderTextColor={props.placeholderTextColor}
                onChangeText={props.onChangeText}
                placeholder={props.placeholder}
                onKeyPress={props.onKeyPress}
                onStateChange={props.onStateChange}
                maxHeight={120}
            />
        </View>
    );
}
