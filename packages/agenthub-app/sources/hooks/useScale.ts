import * as React from 'react';
import { useLocalSetting, useLocalSettingMutable } from '@/sync/storage';

// Scale levels from largest (default) to smallest
export const SCALE_LEVELS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5] as const;
export type ScaleLevel = (typeof SCALE_LEVELS)[number];

function createScaleFn(multiplier: number) {
    return (base: number) => Math.max(1, Math.round(base * multiplier));
}

type ScaleSettingKey = 'sessionListScale' | 'chatScale' | 'fileScale' | 'fileListScale' | 'deviceScale' | 'settingsScale';

function useScaleBase(settingKey: ScaleSettingKey) {
    const scale = useLocalSetting(settingKey);
    const [scaleMutable, setScale] = useLocalSettingMutable(settingKey);
    // useLocalSettingMutable reads from the store, use the mutable version for the setter
    const s = React.useMemo(() => createScaleFn(scale), [scale]);
    return { scale, setScale, s };
}

/** Hook for session list scaling */
export function useSessionListScale() {
    return useScaleBase('sessionListScale');
}

/** Hook for chat page scaling */
export function useChatScale() {
    return useScaleBase('chatScale');
}

/** Hook for file preview scaling */
export function useFileScale() {
    return useScaleBase('fileScale');
}

/** Hook for file tree, picker, and git file list scaling */
export function useFileListScale() {
    return useScaleBase('fileListScale');
}

/** Hook for device page scaling */
export function useDeviceScale() {
    return useScaleBase('deviceScale');
}

/** Hook for settings page scaling */
export function useSettingsScale() {
    return useScaleBase('settingsScale');
}

/** Hook for shared list, menu, and settings item scaling */
export function useListScale() {
    return useScaleBase('settingsScale');
}
