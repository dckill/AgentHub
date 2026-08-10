import { describe, expect, it } from 'vitest';
import { filterPushTargetsForActiveDevice } from './pushTargeting';

const targets = [
    { id: 'legacy', token: 'token-legacy', deviceId: null, createdAt: 1, updatedAt: 1 },
    { id: 'owner', token: 'token-owner', deviceId: 'device-a', createdAt: 1, updatedAt: 1 },
    { id: 'observer', token: 'token-observer', deviceId: 'device-b', createdAt: 1, updatedAt: 1 },
];

describe('push target filtering', () => {
    it('keeps legacy and non-owner tokens while excluding the active device', () => {
        expect(filterPushTargetsForActiveDevice(targets, 'device-a', new Set(['device-a'])).map((target) => target.id))
            .toEqual(['legacy', 'observer']);
    });

    it('does not filter when a session has no active device', () => {
        expect(filterPushTargetsForActiveDevice(targets, null)).toEqual(targets);
    });

    it('keeps the controller token when there is no active UI presence proof', () => {
        expect(filterPushTargetsForActiveDevice(targets, 'device-a', new Set()))
            .toEqual(targets);
    });

    it('filters the controller token only after active UI presence is proven', () => {
        expect(filterPushTargetsForActiveDevice(targets, 'device-a', new Set(['device-a'])))
            .toEqual([targets[0], targets[2]]);
    });
});
