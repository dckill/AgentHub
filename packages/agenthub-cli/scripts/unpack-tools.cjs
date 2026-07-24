#!/usr/bin/env node

/**
 * Prepares platform-specific binaries from the archives shipped in the npm
 * package. Package managers may disable dependency lifecycle scripts, so the
 * CLI entrypoint also calls this module before loading the runtime bundle.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const tar = require('tar');
const os = require('os');
const packageJson = require('../package.json');

const INTERNAL_TOOLS_DIR_ENV = 'AGENTHUB_INTERNAL_TOOLS_DIR';

function getPlatformDir(platform = os.platform(), arch = os.arch()) {
    if (platform === 'darwin') {
        if (arch === 'arm64') return 'arm64-darwin';
        if (arch === 'x64') return 'x64-darwin';
    } else if (platform === 'linux') {
        if (arch === 'arm64') return 'arm64-linux';
        if (arch === 'x64') return 'x64-linux';
    } else if (platform === 'win32') {
        if (arch === 'x64') return 'x64-win32';
        if (arch === 'arm64') return 'arm64-win32';
    }

    throw new Error(`Unsupported platform: ${arch}-${platform}`);
}

function getToolsDir() {
    return path.resolve(__dirname, '..', 'tools');
}

function getAgentHubHomeDir() {
    const configured = process.env.AGENTHUB_HOME_DIR;
    if (!configured) return path.join(os.homedir(), '.agenthub');
    return path.resolve(configured.replace(/^~(?=$|[\\/])/, os.homedir()));
}

function getCacheToolsDir({
    cacheRootDir = getAgentHubHomeDir(),
    packageVersion = packageJson.version,
    platformDir = getPlatformDir(),
} = {}) {
    for (const [label, value] of [['package version', packageVersion], ['platform', platformDir]]) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9._+-]+$/.test(value)) {
            throw new Error(`Invalid bundled tool ${label}: ${value}`);
        }
    }
    return path.resolve(cacheRootDir, 'tools', packageVersion, platformDir);
}

function markRuntimeToolsDir(unpackedPath) {
    process.env[INTERNAL_TOOLS_DIR_ENV] = unpackedPath;
    return unpackedPath;
}

function ensurePrivateDirectory(directory, recursive = false) {
    try {
        fs.mkdirSync(directory, { recursive, mode: 0o700 });
    } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
    }
    const stats = fs.lstatSync(directory);
    if (stats.isSymbolicLink()) throw new Error(`Private tool cache path must not be a symbolic link: ${directory}`);
    if (!stats.isDirectory()) throw new Error(`Private tool cache path must be a directory: ${directory}`);
    fs.chmodSync(directory, 0o700);
}

function ensurePrivateDirectoryWithin(root, destination) {
    const resolvedRoot = path.resolve(root);
    const resolvedDestination = path.resolve(destination);
    const relative = path.relative(resolvedRoot, resolvedDestination);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Private tool cache path escapes its root: ${resolvedDestination}`);
    }

    ensurePrivateDirectory(resolvedRoot, true);
    let current = resolvedRoot;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        ensurePrivateDirectory(current);
    }
}

function getExpectedToolNames(platform = os.platform()) {
    return [
        platform === 'win32' ? 'difft.exe' : 'difft',
        platform === 'win32' ? 'rg.exe' : 'rg',
        'ripgrep.node',
    ];
}

function areToolsUnpacked(toolsDir, platformDir = getPlatformDir(), platform = os.platform()) {
    const unpackedPath = path.join(toolsDir, 'unpacked');
    try {
        const unpackedStats = fs.lstatSync(unpackedPath);
        if (!unpackedStats.isDirectory() || unpackedStats.isSymbolicLink()) return false;
        if (fs.readFileSync(path.join(unpackedPath, '.platform'), 'utf8') !== `${platformDir}\n`) return false;
        return getExpectedToolNames(platform).every((name) => {
            const stats = fs.lstatSync(path.join(unpackedPath, name));
            if (!stats.isFile() || stats.isSymbolicLink()) return false;
            if (platform !== 'win32' && name !== 'ripgrep.node' && (stats.mode & 0o100) === 0) return false;
            return true;
        });
    } catch {
        return false;
    }
}

async function unpackArchive(archivePath, destination, platform = os.platform()) {
    const archiveStats = fs.lstatSync(archivePath);
    if (!archiveStats.isFile() || archiveStats.isSymbolicLink()) {
        throw new Error(`Bundled tool archive must be a regular file: ${archivePath}`);
    }
    await new Promise((resolve, reject) => {
        fs.createReadStream(archivePath)
            .on('error', reject)
            .pipe(zlib.createGunzip())
            .on('error', reject)
            .pipe(tar.extract({
                cwd: destination,
                preserveMode: true,
                preserveOwner: false,
                strict: true,
            }))
            .on('finish', resolve)
            .on('error', reject);
    });

    if (platform !== 'win32') {
        for (const name of fs.readdirSync(destination)) {
            const filePath = path.join(destination, name);
            const stats = fs.lstatSync(filePath);
            if (stats.isFile() && !stats.isSymbolicLink() && !name.endsWith('.node')) {
                fs.chmodSync(filePath, 0o755);
            }
        }
    }
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireUnpackLock(toolsDir, timeoutMs = 30_000) {
    const lockPath = path.join(toolsDir, '.unpack-lock');
    const startedAt = Date.now();
    while (true) {
        try {
            fs.mkdirSync(lockPath, { mode: 0o700 });
            fs.writeFileSync(
                path.join(lockPath, 'owner.json'),
                `${JSON.stringify({ pid: process.pid, createdAt: Date.now() })}\n`,
                { mode: 0o600 },
            );
            return lockPath;
        } catch (error) {
            if (error?.code !== 'EEXIST') throw error;
            try {
                if (Date.now() - fs.statSync(lockPath).mtimeMs > 120_000) {
                    fs.rmSync(lockPath, { recursive: true, force: true });
                    continue;
                }
            } catch (statError) {
                if (statError?.code !== 'ENOENT') throw statError;
                continue;
            }
            if (Date.now() - startedAt >= timeoutMs) {
                throw new Error(`Timed out waiting for tool extraction lock: ${lockPath}`);
            }
            await delay(50);
        }
    }
}

function validateStagingDirectory(stagingPath, platform) {
    const expectedNames = getExpectedToolNames(platform).sort();
    const actualNames = fs.readdirSync(stagingPath).sort();
    if (actualNames.length !== expectedNames.length || actualNames.some((entry, index) => entry !== expectedNames[index])) {
        throw new Error(`Unexpected bundled tool entries: ${actualNames.join(', ')}`);
    }
    for (const name of expectedNames) {
        const stats = fs.lstatSync(path.join(stagingPath, name));
        if (!stats.isFile() || stats.isSymbolicLink()) {
            throw new Error(`Unexpected bundled tool type: ${name}`);
        }
    }
}

function installStagingDirectory(toolsDir, stagingPath) {
    const unpackedPath = path.join(toolsDir, 'unpacked');
    const backupPath = path.join(toolsDir, `.unpack-backup-${process.pid}-${Date.now()}`);
    let movedExisting = false;
    try {
        if (fs.existsSync(unpackedPath)) {
            fs.renameSync(unpackedPath, backupPath);
            movedExisting = true;
        }
        fs.renameSync(stagingPath, unpackedPath);
        if (movedExisting) fs.rmSync(backupPath, { recursive: true, force: true });
    } catch (error) {
        if (!fs.existsSync(unpackedPath) && movedExisting && fs.existsSync(backupPath)) {
            fs.renameSync(backupPath, unpackedPath);
        }
        throw error;
    } finally {
        if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });
    }
}

async function unpackTools(options = {}) {
    const platform = options.platformName ?? os.platform();
    const platformDir = options.platformDir ?? getPlatformDir(platform, options.architecture ?? os.arch());
    const sourceToolsDir = options.sourceToolsDir ?? options.toolsDir ?? getToolsDir();
    const cacheRootDir = options.cacheRootDir ?? getAgentHubHomeDir();
    const toolsDir = options.toolsDir ?? options.destinationToolsDir ?? getCacheToolsDir({
        cacheRootDir,
        packageVersion: options.packageVersion,
        platformDir,
    });
    const log = options.silent ? () => {} : console.log;
    let lockPath;
    let stagingPath;
    try {
        const archivesDir = path.join(sourceToolsDir, 'archives');

        if (areToolsUnpacked(sourceToolsDir, platformDir, platform)) {
            log(`Tools already unpacked for ${platformDir}`);
            return {
                success: true,
                alreadyUnpacked: true,
                unpackedPath: markRuntimeToolsDir(path.join(sourceToolsDir, 'unpacked')),
            };
        }

        if (options.toolsDir || options.destinationToolsDir) ensurePrivateDirectory(toolsDir, true);
        else ensurePrivateDirectoryWithin(cacheRootDir, toolsDir);

        if (areToolsUnpacked(toolsDir, platformDir, platform)) {
            log(`Tools already unpacked for ${platformDir}`);
            return {
                success: true,
                alreadyUnpacked: true,
                unpackedPath: markRuntimeToolsDir(path.join(toolsDir, 'unpacked')),
            };
        }

        lockPath = await acquireUnpackLock(toolsDir, options.lockTimeoutMs);
        if (areToolsUnpacked(toolsDir, platformDir, platform)) {
            log(`Tools already unpacked for ${platformDir}`);
            return {
                success: true,
                alreadyUnpacked: true,
                unpackedPath: markRuntimeToolsDir(path.join(toolsDir, 'unpacked')),
            };
        }

        log(`Unpacking tools for ${platformDir}...`);
        stagingPath = path.join(
            toolsDir,
            `.unpack-staging-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        );
        fs.mkdirSync(stagingPath, { mode: 0o700 });

        for (const archiveName of [
            `difftastic-${platformDir}.tar.gz`,
            `ripgrep-${platformDir}.tar.gz`,
        ]) {
            const archivePath = path.join(archivesDir, archiveName);
            if (!fs.existsSync(archivePath)) throw new Error(`Archive not found: ${archivePath}`);
            await unpackArchive(archivePath, stagingPath, platform);
        }

        validateStagingDirectory(stagingPath, platform);
        fs.writeFileSync(path.join(stagingPath, '.platform'), `${platformDir}\n`, { mode: 0o600 });
        installStagingDirectory(toolsDir, stagingPath);
        stagingPath = undefined;

        log(`Tools unpacked successfully to ${path.join(toolsDir, 'unpacked')}`);
        return {
            success: true,
            alreadyUnpacked: false,
            unpackedPath: markRuntimeToolsDir(path.join(toolsDir, 'unpacked')),
        };
    } catch (error) {
        if (!options.silent) console.error('Failed to unpack tools:', error.message);
        throw error;
    } finally {
        if (stagingPath && fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { recursive: true, force: true });
        if (lockPath && fs.existsSync(lockPath)) fs.rmSync(lockPath, { recursive: true, force: true });
    }
}

module.exports = {
    INTERNAL_TOOLS_DIR_ENV,
    unpackTools,
    getPlatformDir,
    getToolsDir,
    getAgentHubHomeDir,
    getCacheToolsDir,
    areToolsUnpacked,
};

if (require.main === module) {
    unpackTools({ toolsDir: getToolsDir() })
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Error:', error);
            process.exit(1);
        });
}
