import * as z from 'zod';

export const MessageMetaSchema = z.object({
  sentFrom: z.string().optional(),
  // Preserve provider/plugin modes in transit; runners validate support before execution.
  permissionMode: z.string().optional(),
  model: z.string().nullable().optional(),
  effort: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
  customSystemPrompt: z.string().nullable().optional(),
  appendSystemPrompt: z.string().nullable().optional(),
  allowedTools: z.array(z.string()).nullable().optional(),
  disallowedTools: z.array(z.string()).nullable().optional(),
  displayText: z.string().optional(),
  fileReferences: z.array(z.string()).optional(),
  images: z.array(z.object({
    data: z.string(),
    mimeType: z.string(),
    name: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).optional(),
  turnStatus: z.enum(['completed', 'failed', 'cancelled']).optional(),
  finalTextId: z.string().optional(),
});
export type MessageMeta = z.infer<typeof MessageMetaSchema>;
