import { describe, expect, it } from 'vitest';
import { stripLeadingTaskNotificationWrappers } from './controlMessages';

describe('stripLeadingTaskNotificationWrappers', () => {
  it('removes repeated leading wrappers and keeps visible text', () => {
    expect(stripLeadingTaskNotificationWrappers(
      '  <task-notification>one</task-notification>\n<task-notification>two</task-notification>\n继续处理',
    )).toBe('继续处理');
  });

  it('keeps incomplete and inline examples untouched', () => {
    expect(stripLeadingTaskNotificationWrappers('<task-notification>unfinished')).toBe('<task-notification>unfinished');
    expect(stripLeadingTaskNotificationWrappers('示例：<task-notification>x</task-notification>')).toBe('示例：<task-notification>x</task-notification>');
  });
});
