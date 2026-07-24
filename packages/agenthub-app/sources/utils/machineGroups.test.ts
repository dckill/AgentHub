import { describe, expect, it } from 'vitest';
import {
    buildMachineGroupPickerOptions,
    appendMachineGroupOrderIfMissing,
    getOrderedMachineGroupNames,
} from './machineGroups';

describe('machineGroups', () => {
    it('orders explicit group order first, then assigned groups alphabetically', () => {
        expect(getOrderedMachineGroupNames(
            {
                machineA: 'Servers',
                machineB: 'Laptops',
                machineC: 'Servers',
            },
            ['Pinned', 'Servers', ' ', 'Servers'],
        )).toEqual(['Pinned', 'Servers', 'Laptops']);
    });

    it('builds picker options with ungrouped, existing groups, and create group action', () => {
        expect(buildMachineGroupPickerOptions(
            {
                machineA: 'Servers',
                machineB: 'Laptops',
            },
            ['Servers'],
            'machineA',
        )).toEqual([
            { key: '__ungrouped__', label: 'Ungrouped', selected: false },
            { key: 'Servers', label: 'Servers', selected: true },
            { key: 'Laptops', label: 'Laptops', selected: false },
            { key: '__new__', label: 'New Group', selected: false },
        ]);
    });

    it('marks ungrouped as selected when a machine has no group', () => {
        expect(buildMachineGroupPickerOptions(
            {
                machineA: 'Servers',
            },
            ['Servers'],
            'machineB',
        )[0]).toEqual({ key: '__ungrouped__', label: 'Ungrouped', selected: true });
    });

    it('does not append empty or ungrouped keys to group order', () => {
        expect(appendMachineGroupOrderIfMissing(['Servers'], '')).toEqual(['Servers']);
        expect(appendMachineGroupOrderIfMissing(['Servers'], '__ungrouped__')).toEqual(['Servers']);
        expect(appendMachineGroupOrderIfMissing(['Servers'], 'Servers')).toEqual(['Servers']);
        expect(appendMachineGroupOrderIfMissing(['Servers'], 'Laptops')).toEqual(['Servers', 'Laptops']);
    });
});
