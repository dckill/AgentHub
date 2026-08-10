export type UserAppState = 'active' | 'background' | 'inactive';

export function isUserAppState(value: unknown): value is UserAppState {
    return value === 'active' || value === 'background' || value === 'inactive';
}
