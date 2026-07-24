import { afterEach, describe, expect, it } from 'vitest';
import { projectPath } from './projectPath';

const originalCliRoot = process.env.AGENTHUB_CLI_ROOT;

afterEach(() => {
  if (originalCliRoot === undefined) {
    delete process.env.AGENTHUB_CLI_ROOT;
  } else {
    process.env.AGENTHUB_CLI_ROOT = originalCliRoot;
  }
});

describe('projectPath', () => {
  it('uses the environment-private CLI root when provided', () => {
    process.env.AGENTHUB_CLI_ROOT = '/tmp/agenthub-private/cli/bundle';

    expect(projectPath()).toBe('/tmp/agenthub-private/cli/bundle');
  });
});
