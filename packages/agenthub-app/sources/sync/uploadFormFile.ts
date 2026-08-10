import { encodeBase64 } from '@/encryption/base64';
import { cacheDirectory, deleteAsync, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';

export async function appendFormFile(
    formData: FormData,
    bytes: Uint8Array,
    field: string,
    filename: string,
    contentType: string,
): Promise<() => Promise<void>> {
    if (!cacheDirectory) throw new Error('Attachment cache directory is unavailable');
    const tempUri = `${cacheDirectory}agenthub-upload-${randomUUID()}`;
    await writeAsStringAsync(tempUri, encodeBase64(bytes), { encoding: EncodingType.Base64 });
    formData.append(field, { uri: tempUri, type: contentType, name: filename } as unknown as Blob);
    return async () => {
        try { await deleteAsync(tempUri, { idempotent: true }); } catch { /* best effort */ }
    };
}
