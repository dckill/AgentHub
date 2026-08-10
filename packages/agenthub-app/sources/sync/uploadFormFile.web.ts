export async function appendFormFile(
    formData: FormData,
    bytes: Uint8Array,
    field: string,
    filename: string,
    contentType: string,
): Promise<() => Promise<void>> {
    formData.append(field, new Blob([new Uint8Array(bytes).buffer], { type: contentType }), filename);
    return async () => undefined;
}
