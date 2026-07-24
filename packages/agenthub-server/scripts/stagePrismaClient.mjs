import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serverRoot, '../..');
const runtimeImporterRoot = path.join(repositoryRoot, 'packages/agenthub-server-runtime');
const [operation, stagingArgument] = process.argv.slice(2);

if (!['export', 'restore'].includes(operation) || !stagingArgument || !path.isAbsolute(stagingArgument)) {
  throw new Error('Usage: stagePrismaClient.mjs <export|restore> <absolute-staging-directory>');
}

const stagingDirectory = path.resolve(stagingArgument);

if (operation === 'export') {
  const requireFromServer = createRequire(path.join(serverRoot, 'package.json'));
  const clientPackage = requireFromServer.resolve('@prisma/client/package.json');
  const requireFromClient = createRequire(clientPackage);
  const generatedPackage = requireFromClient.resolve('.prisma/client/package.json');
  const generatedDirectory = path.dirname(generatedPackage);
  const queryEngine = fs.readdirSync(generatedDirectory)
    .find((entry) => /^libquery_engine-.+\.so\.node$/.test(entry));
  if (!queryEngine) throw new Error('Generated Prisma client is missing its Linux query engine');
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  fs.cpSync(generatedDirectory, stagingDirectory, { recursive: true, dereference: false });
} else {
  const requireFromRuntime = createRequire(path.join(runtimeImporterRoot, 'package.json'));
  const clientPackage = requireFromRuntime.resolve('@prisma/client/package.json');
  const generatedDirectory = path.resolve(path.dirname(clientPackage), '../..', '.prisma/client');
  if (fs.lstatSync(stagingDirectory).isSymbolicLink()) {
    throw new Error('Prisma client staging directory must not be a symbolic link');
  }
  fs.rmSync(generatedDirectory, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(generatedDirectory), { recursive: true });
  fs.cpSync(stagingDirectory, generatedDirectory, { recursive: true, dereference: false });
}
