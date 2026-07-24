import * as React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Typography } from '@/constants/Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { getChatFooterVisuals } from './chatShellVisuals';

interface ChatFooterProps {
    controlledByUser?: boolean;
}

export const ChatFooter = React.memo((props: ChatFooterProps) => {
    const { theme } = useUnistyles();
    const footerVisuals = getChatFooterVisuals(theme);
    const containerStyle: ViewStyle = {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    };
    const warningContainerStyle: ViewStyle = {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: footerVisuals.backgroundColor,
        borderColor: footerVisuals.borderColor,
        borderWidth: 1,
        borderRadius: 999,
        marginHorizontal: 32,
        marginTop: 4,
    };
    const warningTextStyle: TextStyle = {
        fontSize: 12,
        color: footerVisuals.textColor,
        marginLeft: 6,
        ...Typography.default()
    };
    return (
        <View style={containerStyle}>
            {props.controlledByUser && (
                <View style={warningContainerStyle}>
                    <Ionicons 
                        name="information-circle" 
                        size={16} 
                        color={footerVisuals.textColor}
                    />
                    <Text style={warningTextStyle}>
                        {t('session.permissionHint')}
                    </Text>
                </View>
            )}
        </View>
    );
});
