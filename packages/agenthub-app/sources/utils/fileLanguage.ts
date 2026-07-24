import { getFileExtension } from './filePreviewPolicy';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    cs: 'csharp',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cshtml: 'cshtml',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    markdown: 'markdown',
    mdx: 'markdown',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    sql: 'sql',
    php: 'php',
    r: 'r',
    lua: 'lua',
    dart: 'dart',
    ex: 'elixir',
    exs: 'elixir',
    erl: 'erlang',
    scala: 'scala',
    groovy: 'groovy',
    tf: 'hcl',
    proto: 'protobuf',
    graphql: 'graphql',
    vue: 'html',
    svelte: 'html',
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
    dockerfile: 'docker',
    makefile: 'makefile',
};

export function detectLanguageFromPath(path: string): string | null {
    const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? path.toLowerCase();
    const exact = LANGUAGE_BY_FILENAME[fileName];
    if (exact) return exact;

    const ext = getFileExtension(path);
    return LANGUAGE_BY_EXTENSION[ext] ?? null;
}

export function isMarkdownFilePath(path: string): boolean {
    const ext = getFileExtension(path);
    return ext === 'md' || ext === 'markdown' || ext === 'mdx';
}
