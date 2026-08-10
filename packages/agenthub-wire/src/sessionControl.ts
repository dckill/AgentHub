import { z } from 'zod';

export const SessionControlClaimRequestSchema = z.object({
  sessionId: z.string().min(1),
  deviceId: z.string().trim().min(1).max(256),
});

export const SessionControlReleaseRequestSchema = SessionControlClaimRequestSchema;

export const SessionControlGetRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export const SessionControlStateSchema = z.object({
  sessionId: z.string().min(1),
  activeDeviceId: z.string().nullable(),
  activeDeviceAt: z.number().nullable(),
});

export const SessionControlEventSchema = z.object({
  type: z.literal('session-control'),
  sessionId: z.string().min(1),
  activeDeviceId: z.string().nullable(),
  activeDeviceAt: z.number().nullable(),
});

export const SessionControlResponseSchema = z.object({
  result: z.enum(['granted', 'occupied', 'released', 'state', 'not-found', 'invalid']),
  sessionId: z.string().min(1),
  activeDeviceId: z.string().nullable(),
  activeDeviceAt: z.number().nullable(),
});

export type SessionControlClaimRequest = z.infer<typeof SessionControlClaimRequestSchema>;
export type SessionControlReleaseRequest = z.infer<typeof SessionControlReleaseRequestSchema>;
export type SessionControlGetRequest = z.infer<typeof SessionControlGetRequestSchema>;
export type SessionControlState = z.infer<typeof SessionControlStateSchema>;
export type SessionControlEvent = z.infer<typeof SessionControlEventSchema>;
export type SessionControlResponse = z.infer<typeof SessionControlResponseSchema>;
