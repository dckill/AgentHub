import { trimIdent } from '@/utils/trimIdent';

/** Instruction used by Codex to keep the session title aligned with the task. */
export const CHANGE_TITLE_INSTRUCTION = trimIdent(
  `Based on this message, call functions.agenthub__change_title to change chat session title that would represent the current task. If chat idea would change dramatically - call this function again to update the title.`
);
