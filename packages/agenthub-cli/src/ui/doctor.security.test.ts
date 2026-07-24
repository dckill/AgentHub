import { describe, expect, it } from 'vitest';
import { sanitizeDaemonStateForDisplay } from './doctor';

describe('daemon status secret redaction', () => {
  it('never returns the local control token for terminal output', () => {
    const token = 'high-entropy-control-token-that-must-stay-local';
    const displayed = sanitizeDaemonStateForDisplay({
      pid: 123,
      httpPort: 456,
      controlToken: token,
      ownerNonce: 'owner-nonce-that-should-not-be-displayed',
      processIdentity: {
        pid: 123, startMarker: '1', executablePath: '/usr/bin/node',
        commandDigest: 'a'.repeat(64), bootId: 'boot',
      },
      startTime: 'now',
      startedWithCliVersion: '1.0.3',
    });

    expect(displayed).not.toHaveProperty('controlToken');
    expect(displayed).not.toHaveProperty('ownerNonce');
    expect(displayed).not.toHaveProperty('processIdentity');
    expect(JSON.stringify(displayed)).not.toContain(token);
    expect(displayed).toMatchObject({ pid: 123, httpPort: 456 });
  });
});
