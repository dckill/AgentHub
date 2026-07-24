export type ArchiveFallbackRequest = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

export async function archiveSessionOnServer(options: {
  serverUrl: string;
  sessionId: string;
  token: string;
  metadata?: string;
  expectedMetadataVersion?: number;
  request?: ArchiveFallbackRequest;
}): Promise<{ ok: true } | { ok: false; reason: 'http' | 'network'; status?: number }> {
  const request = options.request ?? (fetch as unknown as ArchiveFallbackRequest);
  try {
    const carriesMetadata = typeof options.metadata === 'string'
      && typeof options.expectedMetadataVersion === 'number';
    const response = await request(
      `${options.serverUrl}/v1/sessions/${encodeURIComponent(options.sessionId)}/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
          ...(carriesMetadata ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(carriesMetadata ? {
          body: JSON.stringify({
            metadata: options.metadata,
            expectedMetadataVersion: options.expectedMetadataVersion,
          }),
        } : {}),
      },
    );
    if (!response.ok) return { ok: false, reason: 'http', status: response.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
