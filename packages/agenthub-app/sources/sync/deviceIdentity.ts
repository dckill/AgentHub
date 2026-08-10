import { randomUUID } from 'expo-crypto';
import { MMKV } from 'react-native-mmkv';

const DEVICE_ID_KEY = 'agenthub-device-id-v1';
const storage = new MMKV({ id: 'agenthub-device-identity' });

export function getOrCreateDeviceId(): string {
    const existing = storage.getString(DEVICE_ID_KEY)?.trim();
    if (existing) {
        return existing;
    }

    const deviceId = randomUUID();
    storage.set(DEVICE_ID_KEY, deviceId);
    return deviceId;
}
