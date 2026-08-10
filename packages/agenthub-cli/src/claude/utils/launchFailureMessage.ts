export const MAX_LAUNCH_FAILURE_DETAIL = 300;

const BASE_MESSAGE = 'Process exited unexpectedly';

/**
 * Preserve actionable child-process failures without letting terminal control
 * sequences or unbounded output reach the App status surface.
 */
export function launchFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return BASE_MESSAGE;
  }

  const detail = error.message
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!detail) {
    return BASE_MESSAGE;
  }

  const bounded = detail.length > MAX_LAUNCH_FAILURE_DETAIL
    ? `${detail.slice(0, MAX_LAUNCH_FAILURE_DETAIL)}…`
    : detail;
  return `${BASE_MESSAGE}: ${bounded}`;
}
