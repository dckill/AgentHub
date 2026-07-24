import * as React from 'react';
import { Pressable } from 'react-native';
import { Item, type ItemProps } from '@/components/Item';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

type SelectRowProps = Pick<
    ItemProps,
    'title' | 'subtitle' | 'subtitleLines' | 'icon' | 'rightElement' | 'showDivider'
> & {
    selected: boolean;
    onPress: () => void;
};

export function SelectRow({ selected, onPress, ...itemProps }: SelectRowProps) {
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityLabel={itemProps.title}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            {...getSpaceKeyActivationProps(onPress)}
            onPress={onPress}
        >
            <Item
                {...itemProps}
                selected={selected}
                showChevron={false}
            />
        </Pressable>
    );
}
