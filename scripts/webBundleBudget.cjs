#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DEFAULT_BUDGET_BYTES = Math.floor(1.48 * 1024 * 1024);

function measureWebBootstrap(exportDirectory, budgetBytes = DEFAULT_BUDGET_BYTES) {
  const root = path.resolve(exportDirectory);
  const indexPath = path.join(root, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);

  if (sources.length === 0) {
    throw new Error(`No bootstrap scripts found in ${indexPath}`);
  }

  const scripts = sources.map((source) => {
    if (/^(?:[a-z]+:)?\/\//i.test(source)) {
      throw new Error(`External bootstrap script is not measurable: ${source}`);
    }

    const pathname = source.split(/[?#]/, 1)[0].replace(/^\/+/, '');
    const filePath = path.resolve(root, pathname);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Bootstrap script escapes export directory: ${source}`);
    }

    const contents = fs.readFileSync(filePath);
    return {
      source,
      rawBytes: contents.length,
      gzipBytes: zlib.gzipSync(contents, { level: 9 }).length,
    };
  });

  const rawBytes = scripts.reduce((total, script) => total + script.rawBytes, 0);
  const gzipBytes = scripts.reduce((total, script) => total + script.gzipBytes, 0);

  return {
    exportDirectory: root,
    budgetBytes,
    scriptCount: scripts.length,
    rawBytes,
    gzipBytes,
    headroomBytes: budgetBytes - gzipBytes,
    passed: gzipBytes <= budgetBytes,
    scripts,
  };
}

if (require.main === module) {
  const exportDirectory = process.argv[2];
  const budgetArgument = process.argv[3];
  if (!exportDirectory) {
    console.error('Usage: node scripts/webBundleBudget.cjs <web-export-directory> [budget-bytes]');
    process.exitCode = 2;
  } else {
    try {
      const budgetBytes = budgetArgument === undefined
        ? DEFAULT_BUDGET_BYTES
        : Number.parseInt(budgetArgument, 10);
      if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0) {
        throw new Error(`Invalid Web bootstrap budget: ${budgetArgument}`);
      }

      const result = measureWebBootstrap(exportDirectory, budgetBytes);
      console.log(JSON.stringify(result, null, 2));
      if (!result.passed) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

module.exports = { DEFAULT_BUDGET_BYTES, measureWebBootstrap };
