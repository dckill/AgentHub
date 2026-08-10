import { describe, expect, it } from 'vitest';
import { launchFailureMessage, MAX_LAUNCH_FAILURE_DETAIL } from './launchFailureMessage';

describe('launchFailureMessage', () => {
  it('keeps a safe single-line launch error for the App', () => {
    const error = new Error('\u001b[31mNative CLI missing\u001b[0m\n reinstall package\u0007');

    expect(launchFailureMessage(error)).toBe(
      'Process exited unexpectedly: Native CLI missing reinstall package',
    );
  });

  it('does not expose arbitrary non-Error throwables', () => {
    expect(launchFailureMessage({ token: 'secret' })).toBe('Process exited unexpectedly');
  });

  it('bounds untrusted child-process output', () => {
    const result = launchFailureMessage(new Error('x'.repeat(MAX_LAUNCH_FAILURE_DETAIL + 1)));

    expect(result).toBe(
      `Process exited unexpectedly: ${'x'.repeat(MAX_LAUNCH_FAILURE_DETAIL)}…`,
    );
  });
});
