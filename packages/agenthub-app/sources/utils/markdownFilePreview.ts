import {
    LARGE_FILE_CONFIRMATION_BYTES,
    buildBase64DataUri,
    classifyFilePreview,
} from './filePreviewPolicy';
import { readSessionFileBase64ContentInChunks } from './filePreviewFallback';
import type { FilePreviewSource } from './filePreviewLoader';

function isRemoteOrDataUrl(url: string): boolean {
    return /^(https?:)?\/\//i.test(url) || /^data:/i.test(url) || /^#/i.test(url);
}

function getHtmlAttribute(tag: string, name: string): string | null {
    const match = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
        ?? tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
    return match?.[2] ?? match?.[1] ?? null;
}

function decodeBasicHtmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripHtmlTags(value: string): string {
    return decodeBasicHtmlEntities(value.replace(/<\/?[^>]+>/g, ''));
}

export function normalizeMarkdownHtml(markdown: string): string {
    let output = markdown;
    output = output.replace(/<!--[\s\S]*?-->/g, '');
    output = output.replace(/<img\b[^>]*>/gi, (tag) => {
        const src = getHtmlAttribute(tag, 'src');
        if (!src) return '';
        const alt = getHtmlAttribute(tag, 'alt') ?? '';
        return `\n![${alt}](${src})\n`;
    });
    output = output.replace(/<pre[^>]*>\s*<code[^>]*class=["']language-([^"']+)["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, lang, content) => `\n\`\`\`${lang}\n${decodeBasicHtmlEntities(content.trim())}\n\`\`\`\n`);
    output = output.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, content) => `\n\`\`\`\n${decodeBasicHtmlEntities(content.trim())}\n\`\`\`\n`);
    output = output.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, content) => `\n${'#'.repeat(Number(level))} ${stripHtmlTags(content).trim()}\n`);
    output = output.replace(/<br\s*\/?>/gi, '\n');
    output = output.replace(/<\/p>|<\/div>|<\/section>|<\/article>/gi, '\n\n');
    output = output.replace(/<li[^>]*>/gi, '\n- ');
    output = output.replace(/<\/li>/gi, '');
    output = output.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
    output = output.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, content) => `**${stripHtmlTags(content)}**`);
    output = output.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, content) => `*${stripHtmlTags(content)}*`);
    output = output.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, content) => `\`${decodeBasicHtmlEntities(stripHtmlTags(content))}\``);
    output = output.replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _quote, href, content) => `[${stripHtmlTags(content).trim()}](${href})`);
    output = output.replace(/<\/?[^>]+>/g, '');
    return decodeBasicHtmlEntities(output);
}

export function collectMarkdownImageUrls(markdown: string): string[] {
    const urls = new Set<string>();
    for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
        if (match[1]) urls.add(match[1].trim());
    }
    for (const match of markdown.matchAll(/<img\b[^>]*>/gi)) {
        const src = getHtmlAttribute(match[0], 'src');
        if (src) urls.add(src.trim());
    }
    return Array.from(urls);
}

export function resolveMarkdownAssetPath(url: string, markdownFilePath: string): string | null {
    const cleanUrl = decodeURIComponent(url.trim().replace(/^["']|["']$/g, '').split('#')[0].split('?')[0]);
    if (!cleanUrl || isRemoteOrDataUrl(cleanUrl)) {
        return null;
    }
    if (cleanUrl.startsWith('/')) {
        return cleanUrl;
    }
    const slashIndex = markdownFilePath.lastIndexOf('/');
    const baseDir = slashIndex >= 0 ? markdownFilePath.slice(0, slashIndex) : '';
    const parts = `${baseDir}/${cleanUrl}`.split('/');
    const normalized: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            normalized.pop();
        } else {
            normalized.push(part);
        }
    }
    return `${markdownFilePath.startsWith('/') ? '/' : ''}${normalized.join('/')}`;
}

export function applyMarkdownImageMap(markdown: string, imageMap: Record<string, string>): string {
    return markdown.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (match, prefix, url, suffix) => {
        const mapped = imageMap[url.trim()];
        return mapped ? `${prefix}${mapped}${suffix}` : match;
    });
}

export function getMarkdownFilePreviewContent(markdown: string, imageMap: Record<string, string>): string {
    return applyMarkdownImageMap(normalizeMarkdownHtml(markdown), imageMap);
}

export async function loadMarkdownImageMapForFile({
    markdown,
    markdownFilePath,
    source,
}: {
    markdown: string;
    markdownFilePath: string;
    source: FilePreviewSource;
}): Promise<Record<string, string>> {
    const rawUrls = collectMarkdownImageUrls(markdown)
        .filter((url) => !isRemoteOrDataUrl(url));
    if (rawUrls.length === 0) {
        return {};
    }

    const entries: Array<[string, string]> = [];
    for (const rawUrl of rawUrls) {
        const assetPath = resolveMarkdownAssetPath(rawUrl, markdownFilePath);
        if (!assetPath) continue;
        const classification = classifyFilePreview(assetPath);
        if (classification.kind !== 'image' && classification.kind !== 'svg') continue;

        try {
            const response = source.kind === 'machine'
                ? await readMachineFileBase64ContentInChunks(source.id, assetPath)
                : await readSessionFileBase64ContentInChunks(source.id, assetPath, LARGE_FILE_CONFIRMATION_BYTES);
            if (!response.success || typeof response.content !== 'string' || response.truncated) {
                continue;
            }
            entries.push([rawUrl, buildBase64DataUri(response.content, classification.mimeType)]);
        } catch {
            // Leave unresolved local image references visible as broken images.
        }
    }

    return Object.fromEntries(entries);
}

async function readMachineFileBase64ContentInChunks(machineId: string, filePath: string) {
    const { machineReadFile } = await import('@/sync/ops');
    return readSessionFileBase64ContentInChunks(machineId, filePath, LARGE_FILE_CONFIRMATION_BYTES, machineReadFile);
}
