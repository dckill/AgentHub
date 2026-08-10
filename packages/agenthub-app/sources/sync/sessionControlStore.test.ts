import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deviceIdentity', () => ({ getOrCreateDeviceId: () => 'device-a' }));

import { sessionControlStore } from './sessionControlStore';

describe('session control store', () => {
  beforeEach(() => sessionControlStore.getState().clear());

  it('derives controller, observer, and unclaimed modes', () => {
    sessionControlStore.getState().apply({ sessionId: 's1', activeDeviceId: null, activeDeviceAt: null });
    expect(sessionControlStore.getState().get('s1').mode).toBe('unclaimed');

    sessionControlStore.getState().apply({ sessionId: 's1', activeDeviceId: 'device-a', activeDeviceAt: 1 });
    expect(sessionControlStore.getState().get('s1').mode).toBe('controller');

    sessionControlStore.getState().apply({ sessionId: 's1', activeDeviceId: 'device-b', activeDeviceAt: 2 });
    expect(sessionControlStore.getState().get('s1').mode).toBe('observer');
  });

  it('starts unknown until the server reports session control', () => {
    expect(sessionControlStore.getState().get('missing').mode).toBe('unknown');
  });
});
