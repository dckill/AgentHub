import { Platform, StyleSheet, Switch as RNSwitch, type SwitchProps } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Deferred } from './Deferred';

type AgentHubSwitchProps = Omit<SwitchProps, 'accessibilityLabel'> & {
    accessibilityLabel: string;
};

const styles = StyleSheet.create({
    target: {
        minWidth: 44,
        minHeight: 44,
    },
});

export const Switch = (props: AgentHubSwitchProps) => {
    const { theme } = useUnistyles();
    const { value, disabled, style, ...rest } = props;
    const isOn = Boolean(value);

    return (
        <Deferred enabled={Platform.OS === 'android'}>
            <RNSwitch
                {...rest}
                style={[styles.target, style]}
                value={value}
                disabled={disabled}
                trackColor={{ false: theme.colors.switch.track.inactive, true: theme.colors.switch.track.active }}
                ios_backgroundColor={theme.colors.switch.track.inactive}
                thumbColor={isOn ? theme.colors.switch.thumb.active : theme.colors.switch.thumb.inactive}
                {...{
                    activeThumbColor: theme.colors.switch.thumb.active,
                }}
            />
        </Deferred>
    );
}
