const TASK_NOTIFICATION_OPEN = '<task-notification>';
const TASK_NOTIFICATION_CLOSE = '</task-notification>';

function leadingTaskNotificationEnd(text: string): number | null {
  if (!text.startsWith(TASK_NOTIFICATION_OPEN)) return null;

  let depth = 1;
  let cursor = TASK_NOTIFICATION_OPEN.length;
  while (depth > 0) {
    const nextOpen = text.indexOf(TASK_NOTIFICATION_OPEN, cursor);
    const nextClose = text.indexOf(TASK_NOTIFICATION_CLOSE, cursor);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + TASK_NOTIFICATION_OPEN.length;
    } else {
      depth -= 1;
      cursor = nextClose + TASK_NOTIFICATION_CLOSE.length;
    }
  }
  return cursor;
}

/**
 * 移除消息开头完整的后台任务控制包络，并保留其后的真实正文。
 * 不完整标签和正文中间的示例标签保持原样，避免误删用户内容。
 */
export function stripLeadingTaskNotificationWrappers(text: string): string {
  let remainder = text.trimStart();
  let stripped = false;
  while (remainder.startsWith(TASK_NOTIFICATION_OPEN)) {
    const end = leadingTaskNotificationEnd(remainder);
    if (end === null) break;
    stripped = true;
    remainder = remainder.slice(end).trimStart();
  }
  return stripped ? remainder : text;
}
